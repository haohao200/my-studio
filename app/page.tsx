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
  const [msg, setMsg] = useState('')

  // 聊天相关的状态
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<any[]>([])

  // 登录功能 (移除了里面的 setupChat，交给下方的 useEffect 统一处理)
  const handleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setMsg('登录失败：' + error.message)
    } else {
      setUser(data.user)
      setMsg('登录成功！欢迎来到工作室。')
    }
  }

  // 退出登录
  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setMessages([])
    setMsg('已退出')
  }

  // 签到功能
  const handleCheckIn = async () => {
    if (!user) return setMsg('请先登录')
    const { error } = await supabase.from('check_ins').insert({ user_id: user.id })
    
    if (error) {
      if (error.code === '23505') {
        setMsg('今天已经签到过了，明天再来吧！')
      } else {
        setMsg('签到出错：' + error.message)
      }
    } else {
      setMsg('签到成功！✅')
    }
  }

  // 核心修复：统一在这里管理聊天室的连接和断开
  useEffect(() => {
    // 如果没登录，就不连接
    if (!user) return

    // 建立唯一的频道连接
    const channel = supabase.channel('studio-room')

    channel
      .on('broadcast', { event: 'message' }, (payload) => {
        setMessages((prev) => {
          // 加了一层保险：过滤掉因为各种原因导致的重复消息
          const isDuplicate = prev.some(m => 
            m.time === payload.payload.time && 
            m.text === payload.payload.text && 
            m.sender === payload.payload.sender
          )
          if (isDuplicate) return prev
          return [...prev, payload.payload]
        })
      })
      .subscribe()

    // 每次组件重新加载或退出时，彻底销毁频道，防止重复接收
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user]) // 只有 user 发生变化时，才重新执行

  // 发送消息
  const sendMessage = async () => {
    if (!chatInput.trim() || !user) return
    
    // 顺便给每条消息加一个随机 ID，彻底杜绝重复渲染的视觉 bug
    const newMsg = { 
      id: Date.now() + Math.random().toString(), 
      text: chatInput, 
      sender: user.email, 
      time: new Date().toLocaleTimeString() 
    }
    
    // 向服务器发送广播
    await supabase.channel('studio-room').send({
      type: 'broadcast',
      event: 'message',
      payload: newMsg,
    })

    // 自己本地也立刻显示
    setMessages((prev) => [...prev, newMsg])
    setChatInput('')
  }

  // 页面加载时检查是否已登录
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
      }
    })
  }, [])

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-black">
        <h1 className="text-2xl font-bold mb-6 text-center">工作室工作站</h1>
        
        {msg && <div className="bg-blue-100 text-blue-700 p-3 rounded mb-4 text-sm">{msg}</div>}

        {!user ? (
          // 登录表单
          <div className="flex flex-col gap-4">
            <input className="border p-2 rounded" placeholder="输入邮箱" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="border p-2 rounded" placeholder="输入密码" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 transition" onClick={handleLogin}>登录</button>
          </div>
        ) : (
          // 登录后的界面
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-green-600 font-bold">已登录：{user.email}</span>
              <button className="bg-red-500 text-white px-2 py-1 rounded text-xs hover:bg-red-600 transition" onClick={handleLogout}>
                退出登录
              </button>
            </div>

            <button className="bg-green-600 text-white p-2 rounded hover:bg-green-700 transition" onClick={handleCheckIn}>今日签到</button>

            {/* 聊天区域 */}
            <div className="border-t pt-4 mt-2">
              <h2 className="font-bold mb-2 text-sm">工作室群聊</h2>
              
              {/* 消息列表 */}
              <div className="h-40 overflow-y-auto bg-gray-50 border rounded p-2 mb-2 flex flex-col gap-1">
                {messages.length === 0 && <span className="text-gray-400 text-xs text-center mt-4">暂无消息，快来说第一句话吧！</span>}
                {messages.map((m, i) => (
                  <div key={m.id || i} className={`text-sm ${m.sender === user.email ? 'text-right' : 'text-left'}`}>
                    <span className="text-xs text-gray-500 block">{m.sender}</span>
                    <span className={`inline-block p-1 rounded max-w-[80%] break-all ${m.sender === user.email ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'}`}>
                      {m.text}
                    </span>
                  </div>
                ))}
              </div>

              {/* 发送框 */}
              <div className="flex gap-2">
                <input 
                  className="border p-2 rounded flex-1 text-sm" 
                  placeholder="说点什么..." 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                />
                <button className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 transition" onClick={sendMessage}>发送</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}