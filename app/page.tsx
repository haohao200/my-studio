'use client'

// ==================== 1. 依赖导入与初始化 ====================
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { CaptchaModal } from 'ray-slide-captcha'
import 'ray-slide-captcha/styles.css'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ==================== 2. 主组件定义与状态管理 ====================
export default function Home() {
  // --- 用户与登录状态 ---
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState<any>(null)
  const [userRole, setUserRole] = useState<string>('member')
  const [msg, setMsg] = useState('') // 顶部全局消息提示

  // --- 聊天室状态 ---
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<any[]>([])

  // --- 滑动验证状态 ---
  const [isCaptchaOpen, setIsCaptchaOpen] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false) // 用于解决服务端渲染 (SSR) 报错

  // ==================== 3. 生命周期与副作用 (Effects) ====================

  // 3.1 标记组件已挂载
  useEffect(() => {
    setMounted(true)
  }, [])

  // 3.2 页面加载时检查是否已登录
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser(session.user)
    })
  }, [])

  // 3.3 用户登录后：获取角色权限 & 连接聊天室
  useEffect(() => {
    if (!user) return

    // 获取管理员权限
    const fetchUserRole = async () => {
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (data) setUserRole(data.role)
    }
    fetchUserRole()

    // 连接实时群聊
    const channel = supabase.channel('studio-room')
    channel
      .on('broadcast', { event: 'message' }, (payload) => {
        setMessages((prev) => {
          // 防止消息重复
          const isDuplicate = prev.some(m => m.time === payload.payload.time && m.text === payload.payload.text && m.sender === payload.payload.sender)
          if (isDuplicate) return prev
          return [...prev, payload.payload]
        })
      })
      .subscribe()

    // 组件卸载或退出登录时断开连接
    return () => { supabase.removeChannel(channel) }
  }, [user])


  // ==================== 4. 核心业务逻辑 (Functions) ====================

  // 4.1 真正执行登录的函数 (供滑动验证成功后调用)
  // 4.1 真正执行登录的函数 (供滑动验证成功后调用)
    const executeLogin = async () => {
    setMsg('正在验证账号...')
    
    try {
      // 尝试请求
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      
      if (error) {
        let friendlyMessage = error.message;
        
        if (error.message === 'Invalid login credentials') {
          friendlyMessage = '账号或密码错误，请重新输入。';
        } else if (error.message === 'Failed to fetch') {
          friendlyMessage = '网络连接波动，请检查网络后重试。';
        }
        
        setMsg('登录失败：' + friendlyMessage)
        setCaptchaToken(null) 
      } else {
        setUser(data.user)
        setMsg('登录成功！欢迎来到奇幻工作室。')
      }
    } catch (err: any) {
      // 如果底层直接抛出了网络错误（比如断网）
      setMsg('网络异常：无法连接到服务器，请稍后再试。')
      setCaptchaToken(null)
    }
  }

  // 4.2 点击“进入工作站”按钮触发 (判断是否有验证Token)
  const handleLogin = () => {
    if (!captchaToken) {
      setIsCaptchaOpen(true) // 没验证过，弹出滑块
    } else {
      executeLogin()         // 验证过了，直接登录
    }
  }

  // 4.3 退出登录
  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setUserRole('member')
    setMessages([])
    setCaptchaToken(null)
    setMsg('已退出')
  }

  // 4.4 每日签到
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

  // 4.5 发送群聊消息
  const sendMessage = async () => {
    if (!chatInput.trim() || !user) return
    const newMsg = { id: Date.now().toString(), text: chatInput, sender: user.email, time: new Date().toLocaleTimeString() }

    await supabase.channel('studio-room').send({ type: 'broadcast', event: 'message', payload: newMsg })
    setMessages((prev) => [...prev, newMsg])
    setChatInput('')
  }


  // ==================== 5. 页面 UI 渲染 ====================
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-black flex flex-col items-center justify-center p-4 text-white">

      {/* 5.1 顶部全局提示框 */}
      {msg && <div className="fixed top-4 bg-indigo-500/80 backdrop-blur-sm px-6 py-2 rounded-full shadow-lg z-50 text-sm">{msg}</div>}

      {!user ? (
        // ==================== 5.2 未登录状态 (登录页) ====================
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

          {/* 滑动验证组件 */}
          {mounted && typeof window !== 'undefined' && (
            <CaptchaModal
              open={isCaptchaOpen}
              onOpenChange={setIsCaptchaOpen}
              apiBaseUrl={window.location.origin}
              onSuccess={(token) => {
                // 解析：状态|用时|偏差值|中文说明
                const [status, time, diff, customMsg] = token.split('|');

                if (status === 'SUCCESS') {
                  setCaptchaToken(token)
                  setMsg(`✅ 验证成功！用时 ${time} 秒。`)
                  setIsCaptchaOpen(false)
                  setTimeout(() => executeLogin(), 1200)
                } else {
                  setMsg(`❌ 验证失败：${customMsg}（用时 ${time} 秒），请重试！`)
                  setIsCaptchaOpen(false)
                }
              }}
              onError={(err: any) => {
                // 因为后端永远返回 200，这个报错基本不会触发了
                setMsg('网络异常，请重试');
              }}
              title="安全验证"
              description="拖动滑块完成拼图（3秒内有效）" // 修改了提示语
            />
          )}
        </div>
      ) : (
        // ==================== 5.3 已登录状态 (工作站主界面) ====================
        <div className="w-full max-w-5xl flex flex-col md:flex-row gap-6 h-[85vh]">

          {/* 5.3.1 左侧：个人信息与功能面板 */}
          <div className="bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-2xl shadow-2xl w-full md:w-1/3 flex flex-col">
            <h1 className="text-2xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              奇幻工作室
            </h1>

            <div className="flex flex-col gap-1 mb-8">
              <span className="text-gray-400 text-xs uppercase tracking-wider">当前账号</span>
              <span className="font-medium text-lg break-all">{user.email}</span>
              {/* 管理员专属皇冠 */}
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

          {/* 5.3.2 右侧：群聊面板 */}
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl w-full md:w-2/3 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/10 bg-black/20">
              <h2 className="font-bold text-gray-200">💬 工作室大厅</h2>
            </div>

            {/* 消息列表区 */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {messages.length === 0 && <span className="text-gray-500 text-sm text-center mt-10">这里空空如也，快来说第一句话吧！</span>}
              {messages.map((m, i) => (
                <div key={m.id || i} className={`flex flex-col max-w-[80%] ${m.sender === user.email ? 'self-end items-end' : 'self-start items-start'}`}>
                  <span className="text-xs text-gray-400 mb-1">{m.sender}</span>
                  <span className={`px-4 py-2 rounded-2xl ${m.sender === user.email
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-sm'
                    : 'bg-white/20 text-gray-100 rounded-tl-sm'
                    }`}>
                    {m.text}
                  </span>
                </div>
              ))}
            </div>

            {/* 消息输入区 */}
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