import { supabase } from './supabase'

const animals = ['고양이', '강아지', '여우', '토끼', '판다', '수달', '펭귄', '호랑이', '다람쥐', '돌고래']
const adjectives = ['익명', '조용한', '빠른', '푸른', '작은', '포근한', '자유로운', '친절한']

export function makeNickname() {
  const a = adjectives[Math.floor(Math.random() * adjectives.length)]
  const b = animals[Math.floor(Math.random() * animals.length)]
  const n = Math.floor(1000 + Math.random() * 9000)
  return `${a}${b}_${n}`
}

export async function ensureAnonymousUser() {
  let { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    session = data.session
  }

  const user = session.user
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) throw profileError

  if (!profile) {
    const nickname = makeNickname()
    const { error: insertError } = await supabase
      .from('profiles')
      .insert({ id: user.id, nickname })

    if (insertError) throw insertError
    return { user, profile: { id: user.id, nickname, is_admin: false } }
  }

  return { user, profile }
}
