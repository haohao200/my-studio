'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function Home() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState<any>(null)
  const [userRole, setUserRole] = useState<string>('member')
  const [msg, setMsg] = useState('')

  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<any[]>([])

  const handleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setMsg('登录失败：' + error.message)
    } else {
      setUser(data.user)
      setMsg('登录成功！欢迎来到奇幻工作室。')
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setUserRole('member')
    setMessages([])
    setMsg('已退出')
  }

  const handleCheckIn = async () => {
    if (!user) return setMsg('请先登录')
    const { error } = await supabase.from('check_ins').insert({ user_id: user.id })
    
    if (error) {
      if (error.code === '23505') setMsg('今天已经签到过了，明天再来吧！')
      else setMsg('签到出错：' + error.message)
    } else {
      setMsg('签到成功！✅')
    }
  }

  const fetchUserRole = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
    if (data) setUserRole(data.role)
  }

  useEffect(() => {
    if (!user) return

    fetchUserRole(user.id)

    const channel = supabase.channel('studio-room')
    channel
      .on('broadcast', { event: 'message' }, (payload) => {
        setMessages((prev) => {
          const isDuplicate = prev.some(m => m.time === payload.payload.time && m.text === payload.payload.text && m.sender === payload.payload.sender)
          if (isDuplicate) return prev
          return [...prev, payload.payload]
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  const sendMessage = async () => {
    if (!chatInput.trim() || !user) return
    const newMsg = { id: Date.now().toString(), text: chatInput, sender: user.email, time: new Date().toLocaleTimeString() }
    await supabase.channel('studio-room').send({ type: 'broadcast', event: 'message', payload: newMsg })
    setMessages((prev) => [...prev, newMsg])
    setChatInput('')
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser(session.user)
    })
  }, [])

  return (
    // 背景变成了深邃的紫蓝色渐变，充满奇幻感
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-black flex flex-col items-center justify-center p-4 text-white">
      
      {/* 顶部全局提示 */}
      {msg && <div className="fixed top-4 bg-indigo-500/80 backdrop-blur-sm px-6 py-2 rounded-full shadow-lg z-50 text-sm">{msg}</div>}

      {!user ? (
        // 登录界面卡片
        <div className="bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-2xl shadow-2xl w-full max-w-md">
          <h1 className="text-3xl font-extrabold mb-8 text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            奇幻工作室
          </h1>
          <div className="flex flex-col gap-5">
            <input 
              className="bg-black/20 border border-white/10 p-3 rounded-lg focus:outline-none focus:border-purple-400 text-white placeholder-gray-400" 
              placeholder="输入邮箱" value={email} onChange={(e) => setEmail(e.target.value)} 
            />
            <input 
              className="bg-black/20 border border-white/10 p-3 rounded-lg focus:outline-none focus:border-purple-400 text-white placeholder-gray-400" 
              placeholder="输入密码" type="password" value={password} onChange={(e) => setPassword(e.target.value)} 
            />
            <button 
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold p-3 rounded-lg hover:from-blue-500 hover:to-purple-500 transition shadow-lg mt-2" 
              onClick={handleLogin}
            >
              进入工作站
            </button>
          </div>
        </div>
      ) : (
        // 登录后的左右分栏大界面
        <div className="w-full max-w-5xl flex flex-col md:flex-row gap-6 h-[85vh]">
          
          {/* 左侧：个人信息与功能面板 */}
          <div className="bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-2xl shadow-2xl w-full md:w-1/3 flex flex-col">
            <h1 className="text-2xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              奇幻工作室
            </h1>
            
            <div className="flex flex-col gap-1 mb-8">
              <span className="text-gray-400 text-xs uppercase tracking-wider">当前账号</span>
              <span className="font-medium text-lg break-all">{user.email}</span>
              {userRole === 'admin' && (
                <span className="w-max mt-1 bg-yellow-500/20 text-yellow-300 text-xs px-2 py-1 rounded border border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.2)]">
                  👑 管理员
                </span>
              )}
            </div>

            <div className="flex-1">
              <button 
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold p-4 rounded-xl hover:from-emerald-400 hover:to-teal-500 transition shadow-lg flex items-center justify-center gap-2" 
                onClick={handleCheckIn}
              >
                <span>📍</span> 今日签到
              </button>
            </div>

            <button 
              className="w-full bg-red-500/20 text-red-300 border border-red-500/30 p-3 rounded-xl hover:bg-red-500/40 transition text-sm mt-4" 
              onClick={handleLogout}
            >
              退出登录
            </button>
          </div>

          {/* 右侧：群聊面板 */}
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl w-full md:w-2/3 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/10 bg-black/20">
              <h2 className="font-bold text-gray-200">💬 工作室大厅</h2>
            </div>
            
            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {messages.length === 0 && <span className="text-gray-500 text-sm text-center mt-10">这里空空如也，快来说第一句话吧！</span>}
              {messages.map((m, i) => (
                <div key={m.id || i} className={`flex flex-col max-w-[80%] ${m.sender === user.email ? 'self-end items-end' : 'self-start items-start'}`}>
                  <span className="text-xs text-gray-400 mb-1">{m.sender}</span>
                  <span className={`px-4 py-2 rounded-2xl ${
                    m.sender === user.email 
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-sm' 
                      : 'bg-white/20 text-gray-100 rounded-tl-sm'
                  }`}>
                    {m.text}
                  </span>
                </div>
              ))}
            </div>

            {/* 发送框 */}
            <div className="p-4 bg-black/20 border-t border-white/10 flex gap-3">
              <input 
                className="flex-1 bg-black/40 border border-white/10 p-3 rounded-xl focus:outline-none focus:border-indigo-400 text-white placeholder-gray-500" 
                placeholder="输入你想说的话..." 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              />
              <button 
                className="bg-indigo-600 text-white px-6 py-2 rounded-xl hover:bg-indigo-500 transition font-medium shadow-md" 
                onClick={sendMessage}
              >
                发送
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}