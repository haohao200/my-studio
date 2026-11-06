'use client'

// ==================== 1. 依赖导入与初始化 ====================
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { CaptchaModal } from 'ray-slide-captcha'
import 'ray-slide-captcha/styles.css'
import packageJson from '../package.json' // 🎯 引入版本信息

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ==================== 2. 主组件 ====================
export default function Home() {
  // --- 用户与状态 ---
  const [user, setUser] = useState<any>(null)
  const [myProfile, setMyProfile] = useState<any>(null)
  const [msg, setMsg] = useState('')
  
  // --- 工具栏导航 ---
  const [activeTab, setActiveTab] = useState<'chat' | 'members' | 'admin'>('chat')

  // --- 聊天室 ---
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<any[]>([])
  
  // --- 成员状态 ---
  const [allMembers, setAllMembers] = useState<any[]>([])
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]) // 存当前在线的用户 ID
  const [todayCheckIns, setTodayCheckIns] = useState<string[]>([]) // 存今天已签到用户 ID

  // --- 滑动验证 ---
  const [isCaptchaOpen, setIsCaptchaOpen] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [pendingLogin, setPendingLogin] = useState<{ account: string, password: string } | null>(null)

  // --- 登录相关 ---
  const [loginMode, setLoginMode] = useState<'formal' | 'activate' | 'temp'>('formal')
  const [accountId, setAccountId] = useState('')
  const [formalPassword, setFormalPassword] = useState('')
  const [activationCode, setActivationCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [justActivated, setJustActivated] = useState<{ id: string, name: string } | null>(null)
  const [tempEmail, setTempEmail] = useState('')
  const [tempPassword, setTempPassword] = useState('')

  // --- 管理员与设置 ---
  const [newInviteUsername, setNewInviteUsername] = useState('')
  const [lastGeneratedCode, setLastGeneratedCode] = useState({ code: '', name: '' })
  const [nickname, setNickname] = useState('')
  const [showNicknameModal, setShowNicknameModal] = useState(false)

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

    // 3.1 获取当前用户档案
    const fetchProfile = async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) {
        const isDebugAccount = user.email === DEBUG_EMAIL
        setMyProfile({ ...data, role: isDebugAccount ? 'admin' : data.role })
        if (!data.nickname) setShowNicknameModal(true)
      }
    }
    fetchProfile()

    // 3.2 记录登录时间
    const recordLogin = async () => {
      await supabase.from('profiles').update({ last_sign_in_at: new Date().toISOString() }).eq('id', user.id)
    }
    recordLogin()

    // 3.3 获取历史消息并监听新消息 (数据库持久化版)
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(100)
      if (data) setMessages(data)
    }
    fetchMessages()

    const chatChannel = supabase.channel('studio-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          // 接收到新消息时，追加到列表末尾
          setMessages((prev) => {
            // 防止刚拉取的历史消息和新消息重复
            if (prev.some(m => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          })
        }
      ).subscribe()

    // 3.4 连接在线状态频道 (Presence)
    const presenceChannel = supabase.channel('studio-presence', {
      config: { presence: { key: user.id } }
    })
    presenceChannel.on('presence', { event: 'sync' }, () => {
      const state = presenceChannel.presenceState()
      setOnlineUsers(Object.keys(state))
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await presenceChannel.track({ online_at: new Date().toISOString() })
      }
    })

    return () => { 
      supabase.removeChannel(chatChannel)
      supabase.removeChannel(presenceChannel)
    }
  }, [user])

  // 🎯 修复：切换去“成员状态”页时，拉取最新成员数据，并开启 5 秒轮询
  useEffect(() => {
    if (activeTab === 'members' && user) {
      fetchAllMembersData() // 刚切过去时先拉取一次
      
      // 每 5 秒自动刷新一次
      const interval = setInterval(() => {
        fetchAllMembersData()
      }, 5000)

      // 切换走或退出时，清理定时器，防止内存泄漏
      return () => clearInterval(interval)
    }
  }, [activeTab, user])

  // ==================== 4. 核心逻辑 ====================

  // 🎯 修复：获取所有成员和今日签到数据（修复时区问题）
  const fetchAllMembersData = async () => {
    // 获取所有成员
    const { data: profiles } = await supabase.from('profiles').select('*').order('created_at', { ascending: true })
    if (profiles) setAllMembers(profiles)

    // 使用本地时区的 YYYY-MM-DD，防止早上 8 点前签到被算作前一天
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    const { data: checkins } = await supabase.from('check_ins').select('user_id').eq('check_in_date', todayStr)
    if (checkins) setTodayCheckIns(checkins.map(c => c.user_id))
  }

  // 4.2 计算离线时间
  const getOfflineTime = (lastSignOutAt: string | null) => {
    if (!lastSignOutAt) return '未知'
    const diffMs = new Date().getTime() - new Date(lastSignOutAt).getTime()
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (days > 30) return '离线'
    if (days > 0) return `离线 ${days}天`
    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    if (hours > 0) return `离线 ${hours}小时`
    const mins = Math.floor(diffMs / (1000 * 60))
    return `离线 ${mins}分钟`
  }

  // 4.3 保存昵称
  const handleSaveNickname = async () => {
    if (!nickname.trim()) return setMsg('昵称不能为空')
    if (nickname.length > 15) return setMsg('昵称不能超过 15 个字符')

    setMsg('正在检查昵称...')
    const { data: existingUser } = await supabase.from('profiles').select('id').eq('nickname', nickname.trim()).maybeSingle()
    if (existingUser) return setMsg('该昵称已被占用，请换一个吧！')

    const { data, error } = await supabase.from('profiles').update({ nickname: nickname.trim() }).eq('id', user.id).select()
    if (error) {
      alert(`⚠️ 保存昵称失败，原因：` + error.message);
    } else {
      setMyProfile({ ...myProfile, nickname: nickname.trim() })
      setShowNicknameModal(false)
      setMsg('昵称设置成功！欢迎加入。')
    }
  }

  // 4.4 登录与退出
  const executeLogin = async (emailToUse: string, passToUse: string) => {
    setMsg('正在验证账号...')
    const { data, error } = await supabase.auth.signInWithPassword({ email: emailToUse, password: passToUse })
    if (error) {
      let friendlyMessage = error.message;
      if (error.message === 'Invalid login credentials') friendlyMessage = '账号或密码错误，请重新输入。';
      else if (error.message === 'Failed to fetch') friendlyMessage = '网络连接失败，请检查网络。';
      setMsg('登录失败：' + friendlyMessage); setCaptchaToken(null)
    } else {
      setUser(data.user); setMsg('登录成功！')
    }
  }

  const doRealLogin = async (account: string, password: string) => {
    const input = account.trim();
    if (/^\d{6}$/.test(input)) {
      executeLogin(`${input}@studio.com`, password)
    } else {
      setMsg('正在查找昵称对应的账号...')
      const { data, error } = await supabase.from('profiles').select('email').eq('nickname', input).single()
      if (error || !data) return setMsg('登录失败：找不到该昵称对应的账号')
      executeLogin(data.email, password)
    }
  }

  const handleLogin = (account: string, password: string) => {
    if (!account || !password) return setMsg('请填写完整的账号和密码')
    if (!captchaToken) {
      setPendingLogin({ account, password }); setIsCaptchaOpen(true)
    } else {
      doRealLogin(account, password)
    }
  }

  const handleLogout = async () => {
    // 记录退出时间
    await supabase.from('profiles').update({ last_sign_out_at: new Date().toISOString() }).eq('id', user.id)
    await supabase.auth.signOut()
    setUser(null); setMyProfile(null); setMessages([]); setCaptchaToken(null); setMsg('已退出')
  }

  // 4.5 激活码与邀请码
  const handleActivate = async () => {
    if (!activationCode.trim() || !newPassword.trim()) return setMsg('请填写激活码和新密码')
    if (newPassword.length < 6) return setMsg('密码长度不能少于 6 位')

    setMsg('正在验证激活码...')
    const inputCode = activationCode.trim().toUpperCase()
    const { data: codeData, error: codeError } = await supabase.from('activation_codes').select('*').eq('code', inputCode).maybeSingle()

    if (codeError) return setMsg('激活失败，系统错误：' + codeError.message)
    if (!codeData) return setMsg('激活失败：无效的激活码')
    if (codeData.is_used) return setMsg('激活失败：该激活码已被使用')
    
    // 判断是否过期
    if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
      return setMsg('激活失败：该激活码已过期，请联系管理员重新获取')
    }

    const newId = Math.floor(100000 + Math.random() * 900000).toString()
    const newEmail = `${newId}@studio.com`

    setMsg('正在生成专属账号...')
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: newEmail, password: newPassword, options: { data: { username: codeData.username } }
    })

    if (authError) return setMsg('激活失败：' + authError.message)
    await supabase.from('activation_codes').update({ is_used: true, assigned_account_id: newId }).eq('id', codeData.id)

    navigator.clipboard.writeText(newId).then(() => setMsg('激活成功！代号已复制到剪贴板。'))
    setJustActivated({ id: newId, name: codeData.username })
    setLoginMode('formal'); setAccountId(newId); setFormalPassword(newPassword)
    setActivationCode(''); setNewPassword('')
  }

  const generateCode = async () => {
    if (!newInviteUsername.trim()) return setMsg('请先输入该邀请码绑定的用户名（真名）')
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase()
    const expireDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const { error } = await supabase.from('activation_codes').insert({
      code: randomCode, username: newInviteUsername.trim(), expires_at: expireDate.toISOString()
    })

    if (error) setMsg('生成失败：' + error.message)
    else {
      setLastGeneratedCode({ code: randomCode, name: newInviteUsername.trim() })
      setMsg('✅ 邀请码生成成功 (1天内有效)')
      setNewInviteUsername('')
    }
  }

  // 4.6 签到与聊天
  const handleCheckIn = async () => {
    if (!user) return setMsg('请先登录')
    const { error } = await supabase.from('check_ins').insert({ user_id: user.id })
    if (error) {
      if (error.code === '23505') setMsg('今天已经签到过了，明天再来吧！')
      else setMsg('签到出错：' + error.message)
    } else {
      setMsg(`签到成功！✅ ${myProfile?.username || '成员'}`)
      fetchAllMembersData() // 🎯 签到成功后立刻刷新一下状态列表
    }
  }

  // 4.6 发送消息 (显示昵称 + 乐观更新)
  const sendMessage = async () => {
    if (!chatInput.trim() || !user) return
    const displayName = myProfile?.nickname || myProfile?.username || '未命名'
    
    // 🎯 核心修改：加上 .select().single()，这样插入成功后，数据库会把这行完整的数据（包含 id 和 created_at）发回来
    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: user.id,
        sender_nickname: displayName,
        content: chatInput
      })
      .select()
      .single()
    
    if (error) {
      setMsg('发送失败：' + error.message)
    } else {
      setChatInput('')
      // 🎯 核心修改：立刻把这条消息塞进本地列表，不需要等服务器推送
      setMessages((prev) => {
        // 去重：如果服务器回推得太快，防止重复显示
        if (prev.some(m => m.id === data.id)) return prev;
        return [...prev, data];
      })
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => setMsg('📋 已复制到剪贴板！'))
  }

  // ==================== 5. UI 渲染 ====================
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-black flex flex-col items-center justify-center p-4 text-white relative">
      {msg && <div className="fixed top-4 bg-indigo-500/80 backdrop-blur-sm px-6 py-2 rounded-full shadow-lg z-50 text-sm animate-pulse">{msg}</div>}

      {!user ? (
        // ==================== 5.1 登录页 ====================
        <div className="bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-2xl shadow-2xl w-full max-w-md">
          <h1 className="text-3xl font-extrabold mb-6 text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            奇幻工作室
          </h1>

          {/* 三个标签页切换 */}
          <div className="flex bg-black/30 rounded-lg p-1 mb-6 text-sm">
            <button onClick={() => setLoginMode('formal')} className={`flex-1 py-2 rounded-md transition ${loginMode === 'formal' ? 'bg-indigo-600 font-bold' : 'text-gray-400'}`}>正式登录</button>
            <button onClick={() => setLoginMode('activate')} className={`flex-1 py-2 rounded-md transition ${loginMode === 'activate' ? 'bg-indigo-600 font-bold' : 'text-gray-400'}`}>激活码激活</button>
            <button onClick={() => setLoginMode('temp')} className={`flex-1 py-2 rounded-md transition ${loginMode === 'temp' ? 'bg-indigo-600 font-bold' : 'text-gray-400'}`}>临时登录</button>
          </div>

          <div className="flex flex-col gap-4">
            {/* 1. 正式登录 */}
            {loginMode === 'formal' && (
              <>
                {justActivated && (
                  <div className="mb-2 p-4 bg-emerald-900/40 border border-emerald-500/50 rounded-xl">
                    <p className="text-sm text-emerald-200 mb-2 text-center">🎉 欢迎，{justActivated.name}！</p>
                    <div className="flex gap-2 items-center w-full">
                      <input type="text" readOnly value={justActivated.id} className="flex-1 min-w-0 bg-black/50 text-emerald-300 font-mono text-center font-bold text-lg rounded py-2" />
                      <button onClick={() => copyToClipboard(justActivated.id)} className="bg-emerald-500 text-black font-bold px-4 py-2 rounded">复制</button>
                    </div>
                  </div>
                )}
                <input className="bg-black/20 border border-white/10 p-3 rounded-lg text-white" placeholder="输入专属代号或昵称" value={accountId} onChange={(e) => setAccountId(e.target.value)} />
                <input className="bg-black/20 border border-white/10 p-3 rounded-lg text-white" placeholder="输入密码" type="password" value={formalPassword} onChange={(e) => setFormalPassword(e.target.value)} />
                <button className="bg-gradient-to-r from-blue-600 to-purple-600 font-bold p-3 rounded-lg mt-2" onClick={() => handleLogin(accountId, formalPassword)}>进入工作站</button>
              </>
            )}

            {/* 2. 激活码激活 */}
            {loginMode === 'activate' && (
              <>
                <input className="bg-black/20 border border-white/10 p-3 rounded-lg text-white" placeholder="输入管理员给你的激活码" value={activationCode} onChange={(e) => setActivationCode(e.target.value)} />
                <input className="bg-black/20 border border-white/10 p-3 rounded-lg text-white" placeholder="设置你的密码 (至少6位)" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                <button className="bg-gradient-to-r from-emerald-500 to-teal-600 font-bold p-3 rounded-lg mt-2" onClick={handleActivate}>激活并生成代号</button>
              </>
            )}

            {/* 3. 临时登录 (邮箱测试) */}
            {loginMode === 'temp' && (
              <>
                <input className="bg-black/20 border border-white/10 p-3 rounded-lg text-white" placeholder="输入测试邮箱" value={tempEmail} onChange={(e) => setTempEmail(e.target.value)} />
                <input className="bg-black/20 border border-white/10 p-3 rounded-lg text-white" placeholder="输入测试密码" type="password" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} />
                <button className="bg-gray-600 font-bold p-3 rounded-lg mt-2" onClick={() => handleLogin(tempEmail, tempPassword)}>临时进入</button>
              </>
            )}
          </div>

          {/* 滑动验证组件 */}
          {mounted && typeof window !== 'undefined' && (
            <CaptchaModal 
              open={isCaptchaOpen} 
              onOpenChange={setIsCaptchaOpen} 
              apiBaseUrl={window.location.origin}
              onSuccess={(token) => {
                setCaptchaToken(token); setMsg('验证成功！正在登录...'); setIsCaptchaOpen(false)
                // 验证成功后判断走哪个登录逻辑
                if (loginMode === 'formal' && pendingLogin) { 
                  doRealLogin(pendingLogin.account, pendingLogin.password); setPendingLogin(null) 
                }
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
        // ==================== 5.2 已登录主界面：左侧工具栏+右侧内容 ====================
        <div className="w-full max-w-6xl flex flex-col md:flex-row gap-6 h-[85vh]">
          
          {/* 左侧：工具栏 */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-2xl w-full md:w-64 flex flex-col">
            <h1 className="text-2xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">奇幻工作室</h1>
            
            <div className="flex flex-col gap-2 mb-8">
              <span className="text-gray-400 text-xs uppercase tracking-wider mb-1">当前身份</span>
              <span className="font-medium text-lg text-white break-all">{myProfile?.nickname || '加载中...'}</span>
              <span className="text-xs text-gray-500">真名: {myProfile?.username || '无'}</span>
              {myProfile?.role === 'admin' && (
                <span className="w-max mt-1 bg-yellow-500/20 text-yellow-300 text-xs px-2 py-1 rounded border border-yellow-500/50">👑 管理员</span>
              )}
            </div>

            {/* 导航菜单 */}
            <div className="flex-1 flex flex-col gap-2">
              <button 
                onClick={() => setActiveTab('chat')} 
                className={`w-full text-left p-3 rounded-xl transition flex items-center gap-3 ${activeTab === 'chat' ? 'bg-indigo-600 text-white' : 'hover:bg-white/10 text-gray-400'}`}
              >
                <span>💬</span> 工作室群聊
              </button>
              <button 
                onClick={() => setActiveTab('members')} 
                className={`w-full text-left p-3 rounded-xl transition flex items-center gap-3 ${activeTab === 'members' ? 'bg-indigo-600 text-white' : 'hover:bg-white/10 text-gray-400'}`}
              >
                <span>👥</span> 成员状态
              </button>

              {/* 🎯 新增：仅管理员可见的生成邀请码按钮 */}
              {myProfile?.role === 'admin' && (
                <button 
                  onClick={() => setActiveTab('admin')} 
                  className={`w-full text-left p-3 rounded-xl transition flex items-center gap-3 ${activeTab === 'admin' ? 'bg-amber-600 text-white' : 'hover:bg-white/10 text-amber-400'}`}
                >
                  <span>🎟️</span> 生成邀请码
                </button>
              )}

              <button className="w-full text-left p-3 rounded-xl transition flex items-center gap-3 hover:bg-white/10 text-gray-500 cursor-not-allowed" disabled>
                <span>📍</span> 今日签到 (见上方)
              </button>
            </div>

            <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-white/10">
              <button className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 font-bold p-3 rounded-xl shadow-lg" onClick={handleCheckIn}>
                快速签到
              </button>
              <button className="w-full bg-red-500/20 text-red-300 border border-red-500/30 p-3 rounded-xl text-sm" onClick={handleLogout}>退出登录</button>
            </div>
          </div>

          {/* 右侧：内容区 */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl w-full md:flex-1 flex flex-col overflow-hidden relative">
            
            {/* 内容区 1：群聊 */}
            {activeTab === 'chat' && (
              <>
                <div className="p-4 border-b border-white/10 bg-black/20 flex justify-between items-center">
                  <h2 className="font-bold text-gray-200">💬 工作室大厅</h2>
                  <span className="text-xs text-gray-400">在线: {onlineUsers.length} 人</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                  {messages.length === 0 && <span className="text-gray-500 text-sm text-center mt-10">这里空空如也，快来说第一句话吧！</span>}
                  {/* 🎯 修改：使用新的字段名 m.sender_nickname 和 m.content */}
                  {messages.map((m) => {
                    const isMe = m.sender_nickname === (myProfile?.nickname || '未命名')
                    return (
                      <div key={m.id} className={`flex flex-col max-w-[80%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
                        <span className="text-xs text-gray-400 mb-1">{m.sender_nickname}</span>
                        <span className={`px-4 py-2 rounded-2xl ${isMe ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-sm' : 'bg-white/20 text-gray-100 rounded-tl-sm'}`}>
                          {m.content}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="p-4 bg-black/20 border-t border-white/10 flex gap-3">
                  <input className="flex-1 bg-black/40 border border-white/10 p-3 rounded-xl text-white" placeholder="输入你想说的话..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} />
                  <button className="bg-indigo-600 text-white px-6 py-2 rounded-xl hover:bg-indigo-500 transition font-medium" onClick={sendMessage}>发送</button>
                </div>
              </>
            )}

            {/* 内容区 2：成员状态 */}
            {activeTab === 'members' && (
              <>
                <div className="p-4 border-b border-white/10 bg-black/20">
                  <h2 className="font-bold text-gray-200">👥 成员状态列表</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                  {allMembers.length === 0 && <span className="text-gray-500 text-sm text-center mt-10">加载成员数据中...</span>}
                  
                  {/* 🎯 核心修改：先对成员进行排序，管理员置顶 */}
                  {[...allMembers]
                    .sort((a, b) => {
                      if (a.role === 'admin' && b.role !== 'admin') return -1;
                      if (a.role !== 'admin' && b.role === 'admin') return 1;
                      return 0; // 角色相同时保持原顺序
                    })
                    .map((member) => {
                      const isOnline = onlineUsers.includes(member.id)
                      const hasCheckedIn = todayCheckIns.includes(member.id)
                      return (
                        <div key={member.id} className="bg-black/30 border border-white/10 p-4 rounded-xl flex items-center justify-between hover:bg-white/5 transition">
                          <div className="flex items-center gap-4">
                            {/* 在线绿点/灰点 */}
                            <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-500'}`}></div>
                            
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white text-base">{member.nickname || '未命名'}</span>
                                <span className="text-xs font-normal text-gray-400">({member.username || '无真名'})</span>
                                
                                {/* 🎯 新增：如果是管理员，显示皇冠标签 */}
                                {member.role === 'admin' && (
                                  <span className="bg-yellow-500/20 text-yellow-300 text-[10px] px-2 py-0.5 rounded border border-yellow-500/50">
                                    👑 管理员
                                  </span>
                                )}
                              </div>
                              
                              <div className="text-xs text-gray-400 flex gap-4 mt-1">
                                <span>上次登录: {member.last_sign_in_at ? new Date(member.last_sign_in_at).toLocaleDateString() : '从未'}</span>
                                <span>{isOnline ? '当前在线' : getOfflineTime(member.last_sign_out_at)}</span>
                              </div>
                            </div>
                          </div>
                          
                          <div>
                            {hasCheckedIn ? (
                              <span className="bg-emerald-500/20 text-emerald-300 text-xs px-3 py-1 rounded-full border border-emerald-500/50">已签到</span>
                            ) : (
                              <span className="bg-gray-500/20 text-gray-400 text-xs px-3 py-1 rounded-full border border-gray-500/50">未签到</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                </div>
              </>
            )}

            {/* 内容区 3：管理员专属面板 */}
            {activeTab === 'admin' && myProfile?.role === 'admin' && (
              <>
                <div className="p-4 border-b border-white/10 bg-black/20">
                  <h2 className="font-bold text-gray-200">🎟️ 邀请码管理</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center">
                  <div className="w-full max-w-md bg-black/30 p-6 rounded-2xl border border-white/10 shadow-lg">
                    <h3 className="text-lg font-bold mb-4 text-amber-300">生成新邀请码</h3>
                    <p className="text-xs text-gray-400 mb-4">邀请码有效期为 24 小时。请在此输入新成员的真名，生成后将邀请码发给对方。</p>
                    
                    <input
                      className="w-full bg-black/40 border border-white/10 p-3 rounded-lg text-white mb-4 focus:outline-none focus:border-amber-400" 
                      placeholder="输入该成员的真名" 
                      value={newInviteUsername} 
                      onChange={(e) => setNewInviteUsername(e.target.value)} 
                    />
                    
                    <button 
                      className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold p-3 rounded-lg transition-colors" 
                      onClick={generateCode}
                    >
                      生成邀请码
                    </button>

                    {/* 刚生成的激活码展示区 */}
                    {lastGeneratedCode.code && (
                      <div className="mt-6 p-4 bg-amber-900/30 border border-amber-500/50 rounded-xl">
                        <p className="text-sm text-amber-200 mb-3">
                          刚生成的激活码 (发给 <strong className="text-white">{lastGeneratedCode.name}</strong>)：
                        </p>
                        <div className="flex gap-2 items-center w-full">
                          <input
                            type="text"
                            readOnly
                            value={lastGeneratedCode.code}
                            className="flex-1 w-full min-w-0 bg-black/50 text-amber-300 font-mono text-center font-bold text-xl rounded py-2"
                          />
                          <button
                            onClick={() => copyToClipboard(lastGeneratedCode.code)}
                            className="flex-shrink-0 bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded transition"
                          >
                            复制
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 强制设置昵称的弹窗 */}
      {showNicknameModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-gray-900 border border-white/20 p-8 rounded-2xl shadow-2xl w-full max-w-sm">
            <h2 className="text-xl font-bold mb-4 text-center text-yellow-400">欢迎加入工作室！</h2>
            <p className="text-sm text-gray-300 mb-6 text-center">为了让同事们认识你，请设置一个昵称（最长15字）</p>
            <input className="bg-black/40 border border-white/10 p-3 rounded-lg w-full text-white text-center text-lg focus:border-yellow-400" placeholder="输入你的昵称" maxLength={15} value={nickname} onChange={(e) => setNickname(e.target.value)} />
            <button className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold p-3 rounded-lg mt-4 shadow-lg" onClick={handleSaveNickname}>确定并进入</button>
          </div>
        </div>
      )}

      {/* 一键调试 */}
      {!user && (
        <button onClick={() => executeLogin(DEBUG_EMAIL, DEBUG_PASSWORD)} className="fixed bottom-6 right-6 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-full shadow-2xl text-sm z-50">⚡ 一键调试登录</button>
      )}
      
      {/* 🎯 新增：左下角悬浮版本号 */}
      <div className="fixed bottom-4 left-4 text-xs text-gray-500 font-mono tracking-wider opacity-60 hover:opacity-100 transition-opacity z-50">
        v{packageJson.version}
      </div>
    </div>
  )
}