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

// ==================== 2. 主组件 ====================
export default function Home() {
  // --- 用户与状态 ---
  const [user, setUser] = useState<any>(null)
  const [myProfile, setMyProfile] = useState<any>(null) // 存自己的档案 (role, username, nickname)
  const [msg, setMsg] = useState('')

  // --- 聊天室 ---
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<any[]>([])

  // --- 滑动验证 ---
  const [isCaptchaOpen, setIsCaptchaOpen] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [pendingLogin, setPendingLogin] = useState<{ account: string, password: string } | null>(null) // 🎯 新增：保存待登录信息

  // --- 登录相关 ---
  const [loginMode, setLoginMode] = useState<'formal' | 'activate' | 'temp'>('formal')
  const [accountId, setAccountId] = useState('')
  const [formalPassword, setFormalPassword] = useState('')

  const [activationCode, setActivationCode] = useState('')
  const [newPassword, setNewPassword] = useState('')

  // 👇 新增：用于在正式登录页展示刚激活的代号
  const [justActivated, setJustActivated] = useState<{ id: string, name: string } | null>(null)

  const [tempEmail, setTempEmail] = useState('')
  const [tempPassword, setTempPassword] = useState('')

  // --- 管理员与设置 ---
  const [newInviteUsername, setNewInviteUsername] = useState('') // 管理员生成邀请码时填写的真名
  // 新增：用来在界面上显示并复制生成的邀请码
  const [lastGeneratedCode, setLastGeneratedCode] = useState({ code: '', name: '' })
  const [nickname, setNickname] = useState('') // 用户自己填写的昵称
  const [showNicknameModal, setShowNicknameModal] = useState(false) // 是否强制弹窗设置昵称

  const DEBUG_EMAIL = 'haohao@studio.com'
  const DEBUG_PASSWORD = 'hh87872118'

  // ==================== 3. 生命周期 ====================
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser(session.user)
    })
  }, [])

  useEffect(() => {
    if (!user) return

    // 获取当前用户档案
    const fetchProfile = async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) {
        // 🎯 核心修改：如果你是调试账号，强制显示管理员
        const isDebugAccount = user.email === DEBUG_EMAIL
        setMyProfile({ ...data, role: isDebugAccount ? 'admin' : data.role })

        if (!data.nickname) setShowNicknameModal(true)
      }
    }
    fetchProfile()

    // 连接群聊
    const channel = supabase.channel('studio-room')
    channel.on('broadcast', { event: 'message' }, (payload) => {
      setMessages((prev) => {
        const isDuplicate = prev.some(m => m.time === payload.payload.time && m.text === payload.payload.text && m.sender === payload.payload.sender)
        if (isDuplicate) return prev
        return [...prev, payload.payload]
      })
    }).subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])


  // ==================== 4. 核心逻辑 ====================

  // 4.1 保存昵称
  const handleSaveNickname = async () => {
    if (!nickname.trim()) return setMsg('昵称不能为空')
    if (nickname.length > 15) return setMsg('昵称不能超过 15 个字符')

    // 检查重名
    setMsg('正在检查昵称...')
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('nickname', nickname.trim())
      .maybeSingle()

    if (existingUser) {
      return setMsg('该昵称已被占用，请换一个吧！')
    }

    // 执行更新
    const { data, error } = await supabase
      .from('profiles')
      .update({ nickname: nickname.trim() })
      .eq('id', user.id)
      .select() // 🎯 核心：让 Supabase 返回更新后的数据，确保真的写进去了

    if (error) {
      // 🎯 如果失败，直接在屏幕上弹窗，不藏着掖着
      alert(`⚠️ 保存昵称失败，原因：` + error.message);
      setMsg('保存失败，请查看弹窗提示');
    } else {
      console.log('更新成功，返回的数据：', data); // 可以在 F12 控制台看到
      setMyProfile({ ...myProfile, nickname: nickname.trim() })
      setShowNicknameModal(false)
      setMsg('昵称设置成功！欢迎加入。')
    }
  }

  // 4.2 登录验证
  const executeLogin = async (emailToUse: string, passToUse: string) => {
    setMsg('正在验证账号...')
    const { data, error } = await supabase.auth.signInWithPassword({ email: emailToUse, password: passToUse })

    if (error) {
      let friendlyMessage = error.message;
      if (error.message === 'Invalid login credentials') friendlyMessage = '账号或密码错误，请重新输入。';
      else if (error.message === 'Failed to fetch') friendlyMessage = '网络连接失败，请检查网络。';
      setMsg('登录失败：' + friendlyMessage)
      setCaptchaToken(null)
    } else {
      setUser(data.user)
      setMsg('登录成功！')
    }
  }

  // 4.2 真正的登录执行逻辑（反查昵称并登录）
  const doRealLogin = async (account: string, password: string) => {
    const input = account.trim();
    
    // 如果是纯数字，直接拼邮箱登录
    if (/^\d{6}$/.test(input)) {
      executeLogin(`${input}@studio.com`, password)
    } else {
      // 如果是中文昵称，去查邮箱
      setMsg('正在查找昵称对应的账号...')
      const { data, error } = await supabase
        .from('profiles')
        .select('email')
        .eq('nickname', input)
        .single()

      if (error || !data) {
        setMsg('登录失败：找不到该昵称对应的账号')
        return
      }
      executeLogin(data.email, password)
    }
  }

  // 4.2 点击按钮的入口
  const handleLogin = (account: string, password: string) => {
    if (!account || !password) return setMsg('请填写完整的账号和密码')
    
    // 如果还没有通过滑块验证
    if (!captchaToken) {
      setPendingLogin({ account, password }) // 先把账号密码存起来
      setIsCaptchaOpen(true)
    } else {
      doRealLogin(account, password)
    }
  }

  // 4.3 激活码激活
  const handleActivate = async () => {
    if (!activationCode.trim() || !newPassword.trim()) return setMsg('请填写激活码和新密码')
    if (newPassword.length < 6) return setMsg('密码长度不能少于 6 位')

    setMsg('正在验证激活码...')
    const { data: codeData, error: codeError } = await supabase
      .from('activation_codes').select('*').eq('code', activationCode.trim()).single()

    if (codeError || !codeData) return setMsg('激活失败：无效的激活码')
    if (codeData.is_used) return setMsg('激活失败：该激活码已被使用')

    const newId = Math.floor(100000 + Math.random() * 900000).toString()
    const newEmail = `${newId}@studio.com`

    setMsg('正在生成专属账号...')
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: newEmail,
      password: newPassword,
      // 🎯 核心新增：把真名作为元数据传过去，数据库触发器会自动接收
      options: {
        data: {
          username: codeData.username
        }
      }
    })

    // 🎯 核心修复：用大括号包起来，并且删掉下面那行重复的报错判断
    if (authError) {
      return setMsg('激活失败：' + authError.message)
    }

    // 下面直接接着写你的更新逻辑（不需要再管 authError 了）

    await supabase.from('activation_codes').update({ is_used: true, assigned_account_id: newId }).eq('id', codeData.id)

    // 🎯 核心修改：激活成功后，不再用 alert 折磨用户
    // 1. 尝试自动复制代号到剪贴板
    navigator.clipboard.writeText(newId).then(() => {
      setMsg('激活成功！代号已自动复制到剪贴板。')
    }).catch(() => {
      setMsg('激活成功！请手动复制你的代号。')
    })

    // 2. 保存激活结果，供 UI 展示
    setJustActivated({ id: newId, name: codeData.username })

    // 3. 自动切回正式登录，并帮你填好账号密码，让你一键登录
    setLoginMode('formal')
    setAccountId(newId)
    setFormalPassword(newPassword)
    setActivationCode(''); setNewPassword('')
  }

  // 4.4 管理员生成激活码 (带用户名)
  const generateCode = async () => {
    if (!newInviteUsername.trim()) return setMsg('请先输入该邀请码绑定的用户名（真名）')

    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase()
    const { error } = await supabase.from('activation_codes').insert({
      code: randomCode,
      username: newInviteUsername.trim()
    })

    if (error) {
      setMsg('生成失败：' + error.message)
    } else {
      // 🎯 核心修改：不再用 alert，而是把数据存到状态里，在界面上渲染出来
      setLastGeneratedCode({ code: randomCode, name: newInviteUsername.trim() })
      setMsg('✅ 邀请码生成成功')
      setNewInviteUsername('') // 清空输入框
    }
  }

  // 新增一个复制函数
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setMsg('📋 邀请码已复制到剪贴板！')
    })
  }

  // 4.5 签到逻辑 (使用真名)
  const handleCheckIn = async () => {
    if (!user) return setMsg('请先登录')
    const { error } = await supabase.from('check_ins').insert({ user_id: user.id })
    if (error) {
      if (error.code === '23505') setMsg('今天已经签到过了，明天再来吧！')
      else setMsg('签到出错：' + error.message)
    } else {
      setMsg(`签到成功！✅ ${myProfile?.username || '成员'}`)
    }
  }

  // 4.6 发送消息 (显示昵称)
  const sendMessage = async () => {
    if (!chatInput.trim() || !user) return
    // 使用 nickname 作为发送者显示
    const displayName = myProfile?.nickname || myProfile?.username || '未命名'
    const newMsg = { id: Date.now().toString(), text: chatInput, sender: displayName, time: new Date().toLocaleTimeString() }

    await supabase.channel('studio-room').send({ type: 'broadcast', event: 'message', payload: newMsg })
    setMessages((prev) => [...prev, newMsg]); setChatInput('')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null); setMyProfile(null); setMessages([]); setCaptchaToken(null); setMsg('已退出')
  }


  // ==================== 5. UI 渲染 ====================
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-black flex flex-col items-center justify-center p-4 text-white relative">

      {msg && <div className="fixed top-4 bg-indigo-500/80 backdrop-blur-sm px-6 py-2 rounded-full shadow-lg z-50 text-sm">{msg}</div>}

      {/* 强制设置昵称的弹窗 */}
      {showNicknameModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-gray-900 border border-white/20 p-8 rounded-2xl shadow-2xl w-full max-w-sm">
            <h2 className="text-xl font-bold mb-4 text-center text-yellow-400">欢迎加入工作室！</h2>
            <p className="text-sm text-gray-300 mb-6 text-center">为了让同事们认识你，请设置一个昵称（最长15字）</p>
            <input
              className="bg-black/40 border border-white/10 p-3 rounded-lg w-full text-white focus:outline-none focus:border-yellow-400 text-center text-lg"
              placeholder="输入你的昵称" maxLength={15}
              value={nickname} onChange={(e) => setNickname(e.target.value)}
            />
            <button className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold p-3 rounded-lg mt-4 shadow-lg" onClick={handleSaveNickname}>
              确定并进入
            </button>
          </div>
        </div>
      )}

      {/* 一键调试 */}
      {!user && (
        <button onClick={() => executeLogin(DEBUG_EMAIL, DEBUG_PASSWORD)} className="fixed bottom-6 right-6 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-full shadow-2xl text-sm z-50">
          ⚡ 一键调试登录
        </button>
      )}

      {!user ? (
        // ==================== 5.1 登录页 ====================
        <div className="bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-2xl shadow-2xl w-full max-w-md">
          <h1 className="text-3xl font-extrabold mb-6 text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            奇幻工作室
          </h1>

          <div className="flex bg-black/30 rounded-lg p-1 mb-6 text-sm">
            <button onClick={() => setLoginMode('formal')} className={`flex-1 py-2 rounded-md transition ${loginMode === 'formal' ? 'bg-indigo-600 font-bold' : 'text-gray-400'}`}>正式登录</button>
            <button onClick={() => setLoginMode('activate')} className={`flex-1 py-2 rounded-md transition ${loginMode === 'activate' ? 'bg-indigo-600 font-bold' : 'text-gray-400'}`}>激活码激活</button>
            <button onClick={() => setLoginMode('temp')} className={`flex-1 py-2 rounded-md transition ${loginMode === 'temp' ? 'bg-indigo-600 font-bold' : 'text-gray-400'}`}>临时登录</button>
          </div>

          <div className="flex flex-col gap-4">
            {loginMode === 'formal' && (
              <>
                {/* 👇 核心新增部分：如果刚激活，就显示绿色复制框 */}
                {justActivated && (
                  <div className="mb-2 p-4 bg-emerald-900/40 border border-emerald-500/50 rounded-xl">
                    <p className="text-sm text-emerald-200 mb-2 text-center">🎉 欢迎，{justActivated.name}！</p>
                    <p className="text-xs text-emerald-300/70 mb-2 text-center">请务必牢记你的专属代号：</p>
                    <div className="flex gap-2 items-center w-full">
                      <input
                        type="text"
                        readOnly
                        value={justActivated.id}
                        className="flex-1 min-w-0 bg-black/50 text-emerald-300 font-mono text-center font-bold text-lg rounded py-2"
                      />
                      <button
                        onClick={() => copyToClipboard(justActivated.id)}
                        className="flex-shrink-0 whitespace-nowrap bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-4 py-2 rounded transition"
                      >
                        复制
                      </button>
                    </div>
                  </div>
                )}
                {/* 👆 新增部分结束 */}

                {/* 👇 把 placeholder 改了 */}
                <input className="bg-black/20 border border-white/10 p-3 rounded-lg text-white" placeholder="输入专属代号或昵称" value={accountId} onChange={(e) => setAccountId(e.target.value)} />
                
                <input className="bg-black/20 border border-white/10 p-3 rounded-lg text-white" placeholder="输入密码" type="password" value={formalPassword} onChange={(e) => setFormalPassword(e.target.value)} />
                
                {/* 🎯 修复：去掉传参后面的 @studio.com */}
                <button className="bg-gradient-to-r from-blue-600 to-purple-600 font-bold p-3 rounded-lg mt-2" onClick={() => handleLogin(accountId, formalPassword)}>进入工作站</button>
              </>
            )}
            {loginMode === 'activate' && (
              <>
                <input className="bg-black/20 border border-white/10 p-3 rounded-lg text-white" placeholder="输入管理员给你的激活码" value={activationCode} onChange={(e) => setActivationCode(e.target.value)} />
                <input className="bg-black/20 border border-white/10 p-3 rounded-lg text-white" placeholder="设置你的密码 (至少6位)" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                <button className="bg-gradient-to-r from-emerald-500 to-teal-600 font-bold p-3 rounded-lg mt-2" onClick={handleActivate}>激活并生成代号</button>
              </>
            )}
            {loginMode === 'temp' && (
              <>
                <input className="bg-black/20 border border-white/10 p-3 rounded-lg text-white" placeholder="输入测试邮箱" value={tempEmail} onChange={(e) => setTempEmail(e.target.value)} />
                <input className="bg-black/20 border border-white/10 p-3 rounded-lg text-white" placeholder="输入测试密码" type="password" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} />
                <button className="bg-gray-600 font-bold p-3 rounded-lg mt-2" onClick={() => handleLogin(tempEmail, tempPassword)}>临时进入</button>
              </>
            )}
          </div>

          {mounted && typeof window !== 'undefined' && (
            <CaptchaModal
              open={isCaptchaOpen}
              onOpenChange={setIsCaptchaOpen}
              apiBaseUrl={window.location.origin}
              onSuccess={(token) => {
                setCaptchaToken(token); setMsg('验证成功！正在登录...'); setIsCaptchaOpen(false)
                
                // 🎯 修复：如果是正式登录，并且有暂存的账号密码，就继续登录
                if (loginMode === 'formal' && pendingLogin) {
                  doRealLogin(pendingLogin.account, pendingLogin.password)
                  setPendingLogin(null) // 用完清空
                } 
                // 如果是临时登录
                else if (loginMode === 'temp') {
                  executeLogin(tempEmail, tempPassword)
                }
              }}
              onError={() => setMsg('验证失败！请确保在 5 秒内完成。')}
              title="安全验证"
            />
          )}
        </div>
      ) : (
        // ==================== 5.2 已登录主界面 ====================
        <div className="w-full max-w-5xl flex flex-col md:flex-row gap-6 h-[85vh]">

          <div className="bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-2xl w-full md:w-1/3 flex flex-col">
            <h1 className="text-2xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">奇幻工作室</h1>

            <div className="flex flex-col gap-1 mb-6">
              <span className="text-gray-400 text-xs uppercase tracking-wider">当前身份</span>
              <span className="font-medium text-lg text-white break-all">{myProfile?.nickname || '加载中...'}</span>
              <span className="text-xs text-gray-500">真名: {myProfile?.username || '无'}</span>
              {myProfile?.role === 'admin' && (
                <span className="w-max mt-2 bg-yellow-500/20 text-yellow-300 text-xs px-2 py-1 rounded border border-yellow-500/50">👑 管理员</span>
              )}
            </div>

            <div className="flex-1 flex flex-col gap-4">
              <button className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 font-bold p-4 rounded-xl shadow-lg" onClick={handleCheckIn}>
                <span>📍</span> 今日签到
              </button>

              {/* 管理员专属：生成激活码 */}
              {myProfile?.role === 'admin' && (
                <div className="bg-black/30 p-4 rounded-xl border border-white/10 mt-4">
                  <h3 className="text-sm font-bold mb-2 text-amber-300">🎟️ 生成新邀请码</h3>
                  <input
                    className="w-full bg-black/40 border border-white/10 p-2 rounded-lg text-sm text-white mb-2"
                    placeholder="输入该成员的真名" value={newInviteUsername} onChange={(e) => setNewInviteUsername(e.target.value)}
                  />
                  <button className="w-full bg-amber-600 hover:bg-amber-500 font-bold p-2 rounded-lg text-sm" onClick={generateCode}>
                    生成邀请码
                  </button>

                  {/* 🎯 核心修改：如果有刚生成的码，就显示出来并提供一个复制按钮 */}
                  {lastGeneratedCode.code && (
                    <div className="mt-4 p-3 bg-amber-900/30 border border-amber-500/50 rounded-lg overflow-hidden">
                      <p className="text-xs text-amber-200 mb-2 truncate">
                        刚生成的激活码 (发给 {lastGeneratedCode.name})：
                      </p>
                      <div className="flex gap-2 items-center w-full">
                        <input
                          type="text"
                          readOnly
                          value={lastGeneratedCode.code}
                          className="flex-1 w-full min-w-0 bg-black/50 text-amber-300 font-mono text-center font-bold text-base rounded py-1.5"
                        />
                        <button
                          onClick={() => copyToClipboard(lastGeneratedCode.code)}
                          className="flex-shrink-0 whitespace-nowrap bg-amber-500 hover:bg-amber-400 text-black font-bold px-3 py-1.5 rounded transition text-sm"
                        >
                          复制
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button className="w-full bg-red-500/20 text-red-300 border border-red-500/30 p-3 rounded-xl mt-4 text-sm" onClick={handleLogout}>退出登录</button>
          </div>

          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl w-full md:w-2/3 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/10 bg-black/20"><h2 className="font-bold text-gray-200">💬 工作室大厅</h2></div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {messages.length === 0 && <span className="text-gray-500 text-sm text-center mt-10">这里空空如也，快来说第一句话吧！</span>}
              {messages.map((m, i) => {
                // 判断是否是自己发的
                const isMe = m.sender === (myProfile?.nickname || '未命名')
                return (
                  <div key={m.id || i} className={`flex flex-col max-w-[80%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
                    <span className="text-xs text-gray-400 mb-1">{m.sender}</span>
                    <span className={`px-4 py-2 rounded-2xl ${isMe ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-sm' : 'bg-white/20 text-gray-100 rounded-tl-sm'}`}>{m.text}</span>
                  </div>
                )
              })}
            </div>

            <div className="p-4 bg-black/20 border-t border-white/10 flex gap-3">
              <input className="flex-1 bg-black/40 border border-white/10 p-3 rounded-xl text-white" placeholder="输入你想说的话..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} />
              <button className="bg-indigo-600 text-white px-6 py-2 rounded-xl hover:bg-indigo-500 transition font-medium" onClick={sendMessage}>发送</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}