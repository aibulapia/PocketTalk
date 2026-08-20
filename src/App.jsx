import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { ensureAnonymousUser } from './lib/auth'
import { MessageCircle, LayoutList, Plus, Send, Trash2, Pencil, X, ShieldAlert, Users, ArrowLeft, RefreshCw, Flag, ShieldCheck, Ban } from 'lucide-react'

const canEdit = (createdAt) => Date.now() - new Date(createdAt).getTime() <= 30 * 60 * 1000
const fmt = (d) => new Date(d).toLocaleString('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [tab, setTab] = useState('board')
  const [boards, setBoards] = useState([])
  const [selectedBoard, setSelectedBoard] = useState(null)
  const [posts, setPosts] = useState([])
  const [post, setPost] = useState(null)
  const [comments, setComments] = useState([])
  const [rooms, setRooms] = useState([])
  const [room, setRoom] = useState(null)
  const [messages, setMessages] = useState([])
  const [modal, setModal] = useState(null)
  const [reports, setReports] = useState([])

  async function boot() {
    try {
      setError('')
      const auth = await ensureAnonymousUser()
      setUser(auth.user)
      setProfile(auth.profile)
      const { data, error } = await supabase.from('boards').select('*').order('sort_order')
      if (error) throw error
      setBoards(data || [])
      setSelectedBoard(data?.[0] || null)
      setReady(true)
    } catch (e) {
      setError(e.message || '초기화에 실패했습니다.')
    }
  }

  useEffect(() => { boot() }, [])

  useEffect(() => {
    if (selectedBoard) loadPosts()
  }, [selectedBoard?.id])

  useEffect(() => { if (tab === 'chat') loadRooms() }, [tab])
  useEffect(() => { if (tab === 'admin' && profile?.is_admin) loadReports() }, [tab, profile?.is_admin])

  async function loadPosts() {
    const { data, error } = await supabase
      .from('posts')
      .select('*, profiles!posts_author_id_fkey(nickname)')
      .eq('board_id', selectedBoard.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)
    if (!error) setPosts(data || [])
  }

  async function openPost(p) {
    setPost(p)
    const [{ data: c }, { data: imgs }] = await Promise.all([
      supabase.from('comments').select('*, profiles!comments_author_id_fkey(nickname)').eq('post_id', p.id).is('deleted_at', null).order('created_at'),
      supabase.from('post_images').select('*').eq('post_id', p.id).order('sort_order')
    ])
    setComments(c || [])
    setPost(prev => ({ ...prev, images: imgs || [] }))
  }

  async function createPost(title, content, images = []) {
    const { data: newPost, error } = await supabase
      .from('posts')
      .insert({ board_id: selectedBoard.id, author_id: user.id, title, content })
      .select()
      .single()
    if (error) throw error

    const uploaded = []
    try {
      for (let index = 0; index < images.length; index++) {
        const authRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/imagekit-auth`, {
          headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}` }
        })
        if (!authRes.ok) throw new Error('ImageKit 업로드 인증에 실패했습니다.')
        const auth = await authRes.json()
        const form = new FormData()
        form.append('file', images[index].file)
        form.append('fileName', `${user.id}-${newPost.id}-${Date.now()}-${index}.webp`)
        form.append('folder', `/pockettalk/${user.id}/${newPost.id}`)
        form.append('publicKey', import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY)
        form.append('signature', auth.signature)
        form.append('expire', String(auth.expire))
        form.append('token', auth.token)
        const uploadRes = await fetch('https://upload.imagekit.io/api/v1/files/upload', { method: 'POST', body: form })
        const result = await uploadRes.json()
        if (!uploadRes.ok || !result.url || !result.fileId) {
          throw new Error(result.message || 'ImageKit 이미지 업로드에 실패했습니다.')
        }

        uploaded.push({
          post_id: newPost.id,
          image_url: result.url,
          imagekit_file_id: result.fileId,
          sort_order: index
        })
      }
      if (uploaded.length) {
        const { error: imageError } = await supabase.from('post_images').insert(uploaded)
        if (imageError) throw imageError
      }
      setModal(null)
      loadPosts()
    } catch (e) {
      if (uploaded.length) await supabase.from('post_images').delete().eq('post_id', newPost.id)
      await supabase.from('posts').delete().eq('id', newPost.id)
      throw e
    }
  }

  async function updatePost(id, title, content) {
    const { error } = await supabase.from('posts').update({ title, content }).eq('id', id)
    if (error) throw error
    setPost(null); setModal(null); loadPosts()
  }

  async function deletePost(id) {
    if (!confirm('게시글과 첨부 이미지를 모두 삭제할까요?')) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/imagekit-delete`, {
        method:'POST',
        headers:{ Authorization:`Bearer ${session?.access_token || ''}`, apikey:import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type':'application/json' },
        body: JSON.stringify({ postId:id })
      })
      const body = await res.json().catch(()=>({}))
      if (!res.ok) throw new Error(body.error || '이미지 삭제에 실패했습니다.')
      const { error } = await supabase.from('posts').delete().eq('id', id)
      if (error) throw error
      setPost(null); loadPosts()
    } catch(e) { alert(e.message || '게시글 삭제에 실패했습니다.') }
  }

  async function report(targetType, targetId, reason) {
    const text = String(reason || '').trim()
    if (!text) return
    const { error } = await supabase.from('reports').insert({ reporter_id:user.id, target_type:targetType, target_id:targetId, reason:text })
    if (error) throw error
    alert('신고가 접수되었습니다.')
  }

  async function loadReports() {
    const { data, error } = await supabase.from('reports').select('*').order('created_at',{ascending:false}).limit(200)
    if (!error) setReports(data || [])
  }

  async function resolveReport(id, status='resolved') {
    const { error } = await supabase.from('reports').update({ status, handled_by:user.id, handled_at:new Date().toISOString() }).eq('id',id)
    if (error) return alert(error.message)
    loadReports()
  }

  async function adminDelete(targetType, targetId, reportId) {
    if (!confirm('관리자 권한으로 삭제할까요?')) return
    try {
      if (targetType === 'post') {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/imagekit-delete`, { method:'POST', headers:{ Authorization:`Bearer ${session?.access_token || ''}`, apikey:import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type':'application/json' }, body:JSON.stringify({ postId:targetId }) })
        const body = await res.json().catch(()=>({}))
        if (!res.ok) throw new Error(body.error || '이미지 삭제에 실패했습니다.')
        const { error } = await supabase.from('posts').delete().eq('id', targetId)
        if (error) throw error
      } else if (targetType === 'comment') {
        const { error } = await supabase.from('comments').delete().eq('id', targetId)
        if (error) throw error
      } else if (targetType === 'message') {
        const { error } = await supabase.from('chat_messages').delete().eq('id', targetId)
        if (error) throw error
      } else if (targetType === 'room') {
        const { error } = await supabase.from('chat_rooms').delete().eq('id', targetId)
        if (error) throw error
      }
      if (reportId) await resolveReport(reportId,'resolved')
      loadReports(); loadPosts(); loadRooms()
    } catch(e) { alert(e.message || '삭제에 실패했습니다.') }
  }

  async function addComment(content) {
    const { error } = await supabase.from('comments').insert({ post_id: post.id, author_id: user.id, content })
    if (error) throw error
    await openPost(post)
  }

  async function updateComment(id, content) {
    const { error } = await supabase.from('comments').update({ content }).eq('id', id)
    if (error) throw error
    await openPost(post)
  }

  async function deleteComment(id) {
    const { error } = await supabase.from('comments').delete().eq('id', id)
    if (error) alert(error.message)
    else openPost(post)
  }

  async function loadRooms() {
    const { data, error } = await supabase.from('chat_rooms').select('*, profiles!chat_rooms_owner_id_fkey(nickname)').eq('is_closed', false).order('created_at', { ascending: false })
    if (!error) setRooms(data || [])
  }

  async function createRoom(name, description) {
    const { error } = await supabase.from('chat_rooms').insert({ owner_id: user.id, name, description: description || null })
    if (error) throw error
    setModal(null); loadRooms()
  }

  async function openRoom(r) {
    try {
      setRoom(r)
      setMessages([])

      const { data, error } = await supabase
        .from('chat_messages')
        .select('*, profiles!chat_messages_author_id_fkey(nickname)')
        .eq('room_id', r.id)
        .order('created_at')
        .limit(200)

      if (error) throw error
      setMessages(data || [])
    } catch (e) {
      setRoom(null)
      alert(e?.message || '채팅방을 불러오지 못했습니다.')
    }
  }

  useEffect(() => {
    if (!room) return
    const channel = supabase.channel(`room-${room.id}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'chat_messages', filter:`room_id=eq.${room.id}` }, async () => {
        const { data } = await supabase.from('chat_messages').select('*, profiles!chat_messages_author_id_fkey(nickname)').eq('room_id', room.id).order('created_at').limit(200)
        setMessages(data || [])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [room?.id])

  async function sendMessage(content) {
    const { error } = await supabase.from('chat_messages').insert({ room_id: room.id, author_id: user.id, content })
    if (error) throw error
  }

  async function closeRoom() {
    if (!confirm('채팅방을 닫고 메시지를 삭제할까요?')) return
    const { error } = await supabase.from('chat_rooms').delete().eq('id', room.id)
    if (error) return alert(error.message)
    setRoom(null); setMessages([]); loadRooms()
  }

  async function changeNickname(nickname) {
    nickname = nickname.trim()
    if (!nickname || nickname.length > 30) throw new Error('닉네임은 1~30자로 입력하세요.')
    const { error } = await supabase.from('profiles').update({ nickname }).eq('id', user.id)
    if (error) throw error
    setProfile(p => ({ ...p, nickname })); setModal(null)
  }

  if (error) return <div className="center"><h2>연결 오류</h2><p>{error}</p><button onClick={boot}>다시 시도</button></div>
  if (!ready) return <div className="center"><div className="logo">포켓톡</div><p>익명으로 연결 중...</p></div>

  return <main className="app">
    <header>
      <div><div className="logo">포켓톡</div><small>익명 게시판 · 익명 대화</small></div>
      <button className="profileBtn" onClick={() => setModal({ type:'nickname' })}>{profile.nickname}</button>
    </header>

    <div className="notice"><ShieldAlert size={16}/> 익명 공간입니다. 개인정보 공개와 비방은 피하고 에티켓을 지켜주세요.</div>

    {tab === 'board' && !post && <>
      <section className="tabs">
        {boards.map(b => <button key={b.id} className={selectedBoard?.id === b.id ? 'active' : ''} onClick={() => setSelectedBoard(b)}>{b.name}</button>)}
      </section>
      <div className="sectionHead"><div><h2>{selectedBoard?.name}</h2><p>{selectedBoard?.description}</p></div><button className="iconBtn" onClick={loadPosts}><RefreshCw size={18}/></button></div>
      <div className="list">
        {posts.length === 0 && <div className="empty">아직 게시글이 없습니다.</div>}
        {posts.map(p => <button className="postCard" key={p.id} onClick={() => openPost(p)}>
          <b>{p.title}</b><p>{p.content}</p><small>{p.profiles?.nickname || '익명'} · {fmt(p.created_at)}</small>
        </button>)}
      </div>
      <button className="fab" onClick={() => setModal({ type:'post' })}><Plus size={20}/> 글쓰기</button>
    </>}

    {tab === 'board' && post && <PostDetail post={post} comments={comments} me={user.id} isAdmin={profile?.is_admin} onReport={report} onBack={() => setPost(null)} onDelete={() => deletePost(post.id)} onEdit={() => setModal({ type:'editPost', post })} onAddComment={addComment} onEditComment={updateComment} onDeleteComment={deleteComment} />}

    {tab === 'chat' && !room && <>
      <div className="sectionHead"><div><h2>채팅방</h2><p>사용자가 직접 공개 채팅방을 만들 수 있습니다.</p></div><button className="iconBtn" onClick={loadRooms}><RefreshCw size={18}/></button></div>
      <div className="list">
        {rooms.length === 0 && <div className="empty">열린 채팅방이 없습니다.</div>}
        {rooms.map(r => <button className="roomCard" key={r.id} onClick={() => openRoom(r)}><MessageCircle size={20}/><div><b>{r.name}</b><p>{r.description || '자유롭게 대화하세요.'}</p><small>개설: {r.profiles?.nickname || '익명'}</small></div></button>)}
      </div>
      <button className="fab" onClick={() => setModal({ type:'room' })}><Plus size={20}/> 방 만들기</button>
    </>}

    {tab === 'chat' && room && <ChatRoom room={room} messages={messages} me={user.id} onBack={() => setRoom(null)} onSend={sendMessage} onClose={room.owner_id === user.id ? closeRoom : null} onReport={report} isAdmin={profile?.is_admin} />}

    {tab === 'admin' && profile?.is_admin && <AdminPanel reports={reports} onRefresh={loadReports} onResolve={resolveReport} onDelete={adminDelete} />}

    <nav>
      <button className={tab==='board'?'active':''} onClick={() => {setTab('board');setPost(null)}}><LayoutList size={20}/>게시판</button>
      <button className={tab==='chat'?'active':''} onClick={() => {setTab('chat');setRoom(null)}}><MessageCircle size={20}/>채팅</button>
      {profile?.is_admin && <button className={tab==='admin'?'active':''} onClick={() => {setTab('admin');setPost(null);setRoom(null)}}><ShieldCheck size={20}/>관리</button>}
    </nav>

    {modal && <Modal modal={modal} onClose={() => setModal(null)} onCreatePost={createPost} onUpdatePost={updatePost} onCreateRoom={createRoom} onNickname={changeNickname} />}
  </main>
}

function PostDetail({ post, comments, me, isAdmin, onReport, onBack, onDelete, onEdit, onAddComment, onEditComment, onDeleteComment }) {
  return <section className="detail">
    <button className="back" onClick={onBack}><ArrowLeft size={20}/> 목록</button>
    <h2>{post.title}</h2><small>{post.profiles?.nickname || '익명'} · {fmt(post.created_at)}</small>
    <div className="content">{post.content}</div>
    {post.images?.length > 0 && <div className="images">{post.images.map(i => <img key={i.id} src={i.image_url} alt="" />)}</div>}
    <div className="actions">
      {post.author_id === me && canEdit(post.created_at) && <button onClick={onEdit}><Pencil size={16}/> 수정</button>}
      {post.author_id === me && <button onClick={onDelete}><Trash2 size={16}/> 삭제</button>}
      {post.author_id !== me && <button onClick={async()=>{const r=prompt('신고 사유를 입력하세요.'); if(r) await onReport('post',post.id,r)}}><Flag size={16}/> 신고</button>}
      {isAdmin && post.author_id !== me && <button onClick={onDelete}><Ban size={16}/> 관리자 삭제</button>}
    </div>
    <h3>댓글 {comments.length}</h3>
    <CommentForm onSubmit={onAddComment} />
    <div className="comments">{comments.map(c => <Comment key={c.id} c={c} me={me} onEdit={onEditComment} onDelete={onDeleteComment} onReport={onReport} isAdmin={isAdmin} />)}</div>
  </section>
}

function Comment({ c, me, onEdit, onDelete, onReport, isAdmin }) {
  const [edit, setEdit] = useState(false)
  const [value, setValue] = useState(c.content)
  return <div className="comment"><div><b>{c.profiles?.nickname || '익명'}</b><small>{fmt(c.created_at)}</small></div>
    {edit ? <div className="inline"><input value={value} onChange={e=>setValue(e.target.value)} /><button onClick={async()=>{await onEdit(c.id,value);setEdit(false)}}>저장</button></div> : <p>{c.content}</p>}
    {c.author_id!==me && <button onClick={async()=>{const r=prompt('신고 사유를 입력하세요.'); if(r) await onReport('comment',c.id,r)}}>신고</button>}
    {isAdmin && c.author_id!==me && <button onClick={()=>onDelete(c.id)}>관리자 삭제</button>}
    {c.author_id===me && <div className="miniActions">{canEdit(c.created_at)&&<button onClick={()=>setEdit(!edit)}>수정</button>}<button onClick={()=>onDelete(c.id)}>삭제</button></div>}
  </div>
}

function CommentForm({ onSubmit }) {
  const [value, setValue] = useState('')
  return <form className="commentForm" onSubmit={async e=>{e.preventDefault(); if(!value.trim())return; await onSubmit(value.trim()); setValue('')}}><input value={value} onChange={e=>setValue(e.target.value)} maxLength="2000" placeholder="익명으로 댓글 작성" /><button><Send size={18}/></button></form>
}

function ChatRoom({ room, messages, me, onBack, onSend, onClose, onReport, isAdmin }) {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      })
    }
  }, [messages.length])

  // 현재 사용자를 채팅방 접속자로 등록하고 10초마다 접속 상태를 갱신합니다.
  useEffect(() => {
    if (!room?.id || !me) return

    let stopped = false

    const touchPresence = async () => {
      const { error } = await supabase
        .from('chat_room_presence')
        .upsert(
          {
            room_id: room.id,
            user_id: me,
            last_seen: new Date().toISOString()
          },
          { onConflict: 'room_id,user_id' }
        )

      if (error && !stopped) {
        console.error('채팅방 접속 상태 갱신 실패:', error.message)
      }
    }

    const leaveRoom = () => {
      stopped = true
      supabase
        .from('chat_room_presence')
        .delete()
        .eq('room_id', room.id)
        .eq('user_id', me)
        .then(({ error }) => {
          if (error) console.error('채팅방 퇴장 처리 실패:', error.message)
        })
    }

    touchPresence()
    const timer = window.setInterval(touchPresence, 10000)

    // 브라우저/탭을 닫을 때도 즉시 퇴장 처리를 시도합니다.
    window.addEventListener('pagehide', leaveRoom)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('pagehide', leaveRoom)
      leaveRoom()
    }
  }, [room?.id, me])

  async function handleSubmit(e) {
    e.preventDefault()

    const content = value.trim()
    if (!content || sending) return

    try {
      setSending(true)
      await onSend(content)
      setValue('')
    } catch (err) {
      alert(err?.message || '메시지 전송에 실패했습니다.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section
      className="chatView"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100dvh - 230px)',
        minHeight: '420px',
        overflow: 'hidden'
      }}
    >
      <div className="chatHead" style={{ flex: '0 0 auto' }}>
        <button type="button" onClick={onBack} aria-label="채팅 목록으로">
          <ArrowLeft size={20} />
        </button>

        <div style={{ minWidth: 0, flex: 1 }}>
          <b>{room.name}</b>
          <small>{room.description || '익명 대화방'}</small>
        </div>

        {onClose && (
          <button
            type="button"
            className="closeRoom"
            onClick={onClose}
            aria-label="채팅방 닫기"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <div
        className="messages"
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain'
        }}
      >
        {messages.length === 0 && (
          <div className="empty">아직 메시지가 없습니다. 첫 메시지를 보내보세요.</div>
        )}

        {messages.map(m => (
          <div
            key={m.id}
            className={'bubble ' + (m.author_id === me ? 'mine' : '')}
          >
            <b>{m.profiles?.nickname || '익명'}</b>
            <p>{m.content}</p>
            <small>{fmt(m.created_at)}</small>
            {m.author_id !== me && <button className="reportMini" onClick={async()=>{const r=prompt('신고 사유를 입력하세요.'); if(r) await onReport('message',m.id,r)}}>신고</button>}
            {isAdmin && m.author_id !== me && <button className="reportMini" onClick={async()=>{if(confirm('메시지를 삭제할까요?')) { const {error}=await supabase.from('chat_messages').delete().eq('id',m.id); if(error) alert(error.message) }}}>삭제</button>}
          </div>
        ))}

        <div ref={endRef} />
      </div>

      <form
        className="chatForm"
        onSubmit={handleSubmit}
        style={{
          flex: '0 0 auto',
          display: 'flex',
          width: '100%',
          position: 'relative',
          zIndex: 2,
          paddingBottom: 'env(safe-area-inset-bottom)'
        }}
      >
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          maxLength="2000"
          placeholder="메시지 입력"
          disabled={sending}
          autoComplete="off"
          style={{ minWidth: 0, flex: 1 }}
        />
        <button type="submit" disabled={sending || !value.trim()} aria-label="메시지 보내기">
          <Send size={20} />
        </button>
      </form>
    </section>
  )
}

function Modal({ modal, onClose, onCreatePost, onUpdatePost, onCreateRoom, onNickname }) {
  const [a, setA] = useState(modal.type === 'editPost' ? modal.post.title : '')
  const [b, setB] = useState(modal.type === 'editPost' ? modal.post.content : '')
  const [images, setImages] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => () => images.forEach(i => i.preview && URL.revokeObjectURL(i.preview)), [images])

  async function optimize(file) {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('JPG, PNG, WEBP만 가능합니다.')
    if (file.size > 15 * 1024 * 1024) throw new Error('원본 이미지는 15MB 이하만 가능합니다.')
    const bitmap = await createImageBitmap(file)
    const max = 1600
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82))
    if (!blob) throw new Error('이미지 변환에 실패했습니다.')
    if (blob.size > 2 * 1024 * 1024) throw new Error('압축 후 이미지가 2MB를 초과했습니다.')
    const name = (file.name.replace(/\.[^.]+$/, '') || 'image') + '.webp'
    const out = new File([blob], name, { type: 'image/webp' })
    return { id: crypto.randomUUID(), file: out, preview: URL.createObjectURL(out) }
  }

  async function pickImages(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    if (images.length + files.length > 3) return alert('이미지는 최대 3장입니다.')
    try {
      setBusy(true)
      const next = []
      for (const file of files) next.push(await optimize(file))
      setImages(prev => [...prev, ...next])
    } catch (err) { alert(err.message || '이미지를 처리하지 못했습니다.') }
    finally { setBusy(false) }
  }

  const submit = async e => {
    e.preventDefault()
    try {
      if (!a.trim()) throw new Error('필수 항목을 입력하세요.')
      setBusy(true)
      if (modal.type === 'post') await onCreatePost(a.trim(), b.trim(), images)
      if (modal.type === 'editPost') await onUpdatePost(modal.post.id, a.trim(), b.trim())
      if (modal.type === 'room') await onCreateRoom(a.trim(), b.trim())
      if (modal.type === 'nickname') await onNickname(a.trim())
    } catch (err) { alert(err.message) }
    finally { setBusy(false) }
  }
  const title = { post:'글쓰기', editPost:'게시글 수정', room:'채팅방 만들기', nickname:'닉네임 변경' }[modal.type]
  return <div className="overlay"><form className="modal" onSubmit={submit}><div className="modalHead"><h3>{title}</h3><button type="button" onClick={onClose} disabled={busy}><X/></button></div>
    {(modal.type==='post'||modal.type==='editPost') && <><input value={a} onChange={e=>setA(e.target.value)} maxLength="150" placeholder="제목" required disabled={busy}/><textarea value={b} onChange={e=>setB(e.target.value)} placeholder="내용" required disabled={busy}/>
    {modal.type==='post' && <div className="imageUploader"><label className="imagePick"><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={pickImages} disabled={busy||images.length>=3}/>이미지 추가 ({images.length}/3)</label><small>JPG · PNG · WEBP / 자동 축소 후 WebP 압축</small><div className="imagePreviewGrid">{images.map(i=><div className="imagePreview" key={i.id}><img src={i.preview} alt=""/><button type="button" onClick={()=>setImages(prev=>prev.filter(x=>x.id!==i.id))} disabled={busy}><X size={16}/></button></div>)}</div></div>}</>}
    {modal.type==='room' && <><input value={a} onChange={e=>setA(e.target.value)} maxLength="50" placeholder="채팅방 이름" required disabled={busy}/><textarea value={b} onChange={e=>setB(e.target.value)} maxLength="200" placeholder="방 설명 (선택)" disabled={busy}/></>}
    {modal.type==='nickname' && <input value={a} onChange={e=>setA(e.target.value)} maxLength="30" placeholder="닉네임" required disabled={busy}/>}
    <button className="primary" disabled={busy}>{busy?'처리 중...':'저장'}</button></form></div>
}


function AdminPanel({ reports, onRefresh, onResolve, onDelete }) {
  return <section className="adminPanel">
    <div className="sectionHead"><div><h2>관리자</h2><p>신고 접수 내역과 콘텐츠를 관리합니다.</p></div><button className="iconBtn" onClick={onRefresh}><RefreshCw size={18}/></button></div>
    {reports.length===0 && <div className="empty">미처리 신고가 없습니다.</div>}
    {reports.map(r => <div className="adminCard" key={r.id}>
      <div><b>{r.target_type} 신고</b><small>{fmt(r.created_at)} · {r.status}</small><p>{r.reason}</p><code>{r.target_id}</code></div>
      <div className="miniActions"><button onClick={()=>onResolve(r.id,'resolved')}>처리완료</button><button onClick={()=>onResolve(r.id,'dismissed')}>기각</button><button onClick={()=>onDelete(r.target_type,r.target_id,r.id)}>삭제</button></div>
    </div>)}
  </section>
}
