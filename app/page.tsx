'use client'

// ==================== 1. 依赖导入与初始化 ====================
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { CaptchaModal } from 'ray-slide-captcha'
import 'ray-slide-captcha/styles.css'
import packageJson from '../package.json'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ==================== 2. 主组件 ====================
export default function Home() {
  // --- 用户与状态 ---
  const [user, setUser] = useState<any>(null)
  const [myProfile, setMyProfile] = useState<any>(null)
  
  // 🎯 提示信息优化：增加可见状态
  const [msg, setMsg] = useState('')
  const [isMsgVisible, setIsMsgVisible] = useState(false)

  // --- 工具栏导航 ---
  const [activeTab, setActiveTab] = useState<'chat' | 'members' | 'admin' | 'history' | 'announcement'>('chat')
  const activeTabRef = useRef(activeTab) // 🎯 解决闭包陷阱

  // --- 聊天室 ---
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<any[]>([])

  // --- 成员状态 ---
  const [allMembers, setAllMembers] = useState<any[]>([])
  const [onlineUsers, setOnlineUsers] = useState<string[]>([])
  const [todayCheckIns, setTodayCheckIns] = useState<string[]>([])

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

  // --- 公告与签到历史 ---
  const [announcement, setAnnouncement] = useState<any>(null)
  const [hasUnreadAnnouncement, setHasUnreadAnnouncement] = useState(false)
  const [editAnnouncement, setEditAnnouncement] = useState('')

  const [selectedDate, setSelectedDate] = useState('')
  const [historyData, setHistoryData] = useState<any[]>([])
  const [selectedMember, setSelectedMember] = useState<any>(null)
  const [memberHistory, setMemberHistory] = useState<any[]>([])

  const DEBUG_EMAIL = 'haohao@studio.com'
  const DEBUG_PASSWORD = 'hh87872118'

  // ==================== 3. 生命周期 ====================

  // 记录当前 Tab 的值，防止 Realtime 回调里拿到旧状态
  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  // 🎯 核心优化：监听 msg 变化，实现 3 秒后自动淡出
  useEffect(() => {
    if (msg) {
      setIsMsgVisible(true) 
      const timer = setTimeout(() => {
        setIsMsgVisible(false)
        setTimeout(() => setMsg(''), 500)
      }, 2500)
      return () => clearTimeout(timer)
    }
  }, [msg])

  useEffect(() => {
    setMounted(true)
    setSelectedDate(new Date().toISOString().split('T')[0])
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser(session.user)
    })
  }, [])

  // 🎯 核心修复：公告数据拉取逻辑
  const fetchLatestAnnouncement = async () => {
    let { data, error } = await supabase
      .from('announcements')
      .select('*, profiles(username)')
      .order('updated_at', { ascending: false })
      .limit(1)

    if (error) {
      console.warn('联表查询公告失败，降级为独立查询：', error.message)
      const fallback = await supabase.from('announcements').select('*').order('updated_at', { ascending: false }).limit(1)
      data = fallback.data
    }
    
    if (data && data.length > 0) {
      setAnnouncement(data[0])
      setEditAnnouncement(data[0].content)
      return data[0]
    }
    return null
  }

  useEffect(() => {
    if (!user) return

    // 3.1 获取当前用户档案
    const fetchProfile = async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) {
        const isDebugAccount = user.email === DEBUG_EMAIL
        const profileData = { ...data, role: isDebugAccount ? 'admin' : data.role }
        setMyProfile(profileData)
        if (!data.nickname) setShowNicknameModal(true)

        // 初始化公告检查
        const latest = await fetchLatestAnnouncement()
        if (latest && new Date(latest.updated_at) > new Date(profileData.last_read_announcement_at || '1970-01-01T00:00:00Z')) {
          setHasUnreadAnnouncement(true)
        }
      }
    }
    fetchProfile()

    // 3.2 记录登录时间
    const recordLogin = async () => {
      await supabase.from('profiles').update({ last_sign_in_at: new Date().toISOString() }).eq('id', user.id)
    }
    recordLogin()

    // 3.3 获取历史消息并监听新消息
    const fetchMessages = async () => {
      const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(100)
      if (data) setMessages(data)
    }
    fetchMessages()

    const chatChannel = supabase.channel('studio-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => {
          if (prev.some(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        })
      }).subscribe()

    // 🎯 修复：公告实时监听 (加入强制刷新和智能红点)
    const announcementChannel = supabase.channel('studio-announcements')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, async (payload) => {
        // 收到新公告，立刻重新拉取（为了拿 profiles 联表数据）
        const latest = await fetchLatestAnnouncement()
        
        if (latest) {
          // 如果当前用户正好停留在“公告栏”页面，直接标记为已读，不显示红点
          if (activeTabRef.current === 'announcement') {
            setHasUnreadAnnouncement(false)
            if (user) {
              const now = new Date().toISOString()
              await supabase.from('profiles').update({ last_read_announcement_at: now }).eq('id', user.id)
              setMyProfile((prev: any) => ({ ...prev, last_read_announcement_at: now }))
            }
          } else {
            // 如果不在公告页，亮起红点提醒
            setHasUnreadAnnouncement(true)
          }
        }
      }).subscribe()

    // 3.4 连接在线状态频道 (Presence)
    const presenceChannel = supabase.channel('studio-presence', {
      config: { presence: { key: user.id } }
    })
    presenceChannel.on('presence', { event: 'sync' }, () => {
      setOnlineUsers(Object.keys(presenceChannel.presenceState()))
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await presenceChannel.track({ online_at: new Date().toISOString() })
      }
    })

    return () => {
      supabase.removeChannel(chatChannel)
      supabase.removeChannel(presenceChannel)
      supabase.removeChannel(announcementChannel)
    }
  }, [user])

  // 切换 Tab 时的数据拉取
  useEffect(() => {
    if (!user) return

    if (activeTab === 'members') {
      fetchAllMembersData()
      const interval = setInterval(() => { fetchAllMembersData() }, 5000)
      return () => clearInterval(interval)
    }
    if (activeTab === 'history' && myProfile?.role === 'admin') {
      fetchHistoryByDate(selectedDate)
    }
    if (activeTab === 'announcement') {
      markAnnouncementAsRead()
    }
  }, [activeTab, user, selectedDate, myProfile?.role])

  // ==================== 4. 核心逻辑 ====================

  const markAnnouncementAsRead = async () => {
    if (!hasUnreadAnnouncement) return
    const now = new Date().toISOString()
    await supabase.from('profiles').update({ last_read_announcement_at: now }).eq('id', user.id)
    setMyProfile((prev: any) => ({ ...prev, last_read_announcement_at: now }))
    setHasUnreadAnnouncement(false)
  }

  const saveAnnouncement = async () => {
    if (!editAnnouncement.trim()) return setMsg('公告内容不能为空')
    const { error } = await supabase.from('announcements').insert({
      content: editAnnouncement.trim(),
      updated_by: user.id
    })
    if (error) setMsg('发布失败：' + error.message)
    else {
      setMsg('✅ 公告已发布')
      // 自己发布的，直接强制刷新一次
      fetchLatestAnnouncement().then(() => setHasUnreadAnnouncement(false))
    }
  }

  // 4.2 签到历史相关
  const fetchHistoryByDate = async (date: string) => {
    setSelectedMember(null)
    setHistoryData([])
    const { data: checkins } = await supabase.from('check_ins').select('user_id').eq('check_in_date', date)
    const checkedIds = checkins?.map(c => c.user_id) || []

    const { data: profiles } = await supabase.from('profiles').select('*').order('role', { ascending: false })
    if (profiles) {
      setHistoryData(profiles.map(p => ({
        ...p,
        hasCheckedIn: checkedIds.includes(p.id)
      })))
    }
  }

  const fetchMemberHistory = async (member: any) => {
    setSelectedMember(member)
    const { data } = await supabase.from('check_ins').select('check_in_date').eq('user_id', member.id).order('check_in_date', { ascending: false })
    if (data) setMemberHistory(data)
  }

  // 获取所有成员和今日签到数据
  const fetchAllMembersData = async () => {
    const { data: profiles } = await supabase.from('profiles').select('*').order('created_at', { ascending: true })
    if (profiles) setAllMembers(profiles)

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    const { data: checkins } = await supabase.from('check_ins').select('user_id').eq('check_in_date', todayStr)
    if (checkins) setTodayCheckIns(checkins.map(c => c.user_id))
  }

  // 4.3 保存昵称
  const handleSaveNickname = async () => {
    if (!nickname.trim()) return setMsg('昵称不能为空')
    if (nickname.length > 15) return setMsg('昵称不能超过 15 个字符')

    setMsg('正在检查昵称...')
    const { data: existingUser } = await supabase.from('profiles').select('id').eq('nickname', nickname.trim()).maybeSingle()
    if (existingUser) return setMsg('该昵称已被占用，请换一个吧！')

    const { data, error } = await supabase.from('profiles').update({ nickname: nickname.trim() }).eq('id', user.id).select()
    if (error) setMsg(`⚠️ 保存昵称失败：` + error.message);
    else {
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
    await supabase.from('profiles').update({ last_sign_out_at: new Date().toISOString() }).eq('id', user.id)
    await supabase.auth.signOut()
    setUser(null); setMyProfile(null); setMessages([]); setCaptchaToken(null); setMsg('已退出')
  }

  // 激活码校验
  const handleActivate = async () => {
    if (!activationCode.trim() || !newPassword.trim()) return setMsg('请填写激活码和新密码')
    if (newPassword.length < 6) return setMsg('密码长度不能少于 6 位')

    setMsg('正在验证激活码...')
    const inputCode = activationCode.trim().toUpperCase()
    const { data: codeData, error: codeError } = await supabase.from('activation_codes').select('*').eq('code', inputCode).maybeSingle()

    if (codeError) return setMsg('激活失败，系统错误：' + codeError.message)
    if (!codeData) return setMsg('激活失败：无效的激活码')
    if (codeData.is_used) return setMsg('激活失败：该激活码已被使用')
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

  // 生成邀请码
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

  // 4.5 签到与聊天
  const handleCheckIn = async () => {
    if (!user) return setMsg('请先登录')
    const { error } = await supabase.from('check_ins').insert({ user_id: user.id })
    if (error) {
      if (error.code === '23505') setMsg('今天已经签到过了，明天再来吧！')
      else setMsg('签到出错：' + error.message)
    } else {
      setMsg(`签到成功！✅ ${myProfile?.username || '成员'}`)
      fetchAllMembersData()
    }
  }

  const sendMessage = async () => {
    if (!chatInput.trim() || !user) return
    const displayName = myProfile?.nickname || myProfile?.username || '未命名'

    const { data, error } = await supabase
      .from('messages')
      .insert({ sender_id: user.id, sender_nickname: displayName, content: chatInput })
      .select()
      .single()

    if (error) {
      setMsg('发送失败：' + error.message)
    } else {
      setChatInput('')
      setMessages((prev) => {
        if (prev.some(m => m.id === data.id)) return prev;
        return [...prev, data];
      })
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => setMsg('📋 已复制到剪贴板！'))
  }

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

  // ==================== 5. UI 渲染 ====================
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-black flex flex-col items-center justify-center p-4 text-white relative">
      
      {/* 顶部提示信息 */}
      <div 
        className={`fixed top-4 bg-indigo-500/90 border border-indigo-400/50 backdrop-blur-md px-6 py-2.5 rounded-full shadow-2xl z-[200] text-sm font-medium text-white transition-all duration-500 ease-out transform ${
          isMsgVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-4 scale-95 pointer-events-none'
        }`}
      >
        {msg}
      </div>

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
        // ==================== 5.2 已登录主界面 ====================
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

            <div className="flex-1 flex flex-col gap-2">
              <button onClick={() => setActiveTab('chat')} className={`w-full text-left p-3 rounded-xl transition flex items-center gap-3 ${activeTab === 'chat' ? 'bg-indigo-600 text-white' : 'hover:bg-white/10 text-gray-400'}`}><span>💬</span> 工作室群聊</button>
              <button onClick={() => setActiveTab('members')} className={`w-full text-left p-3 rounded-xl transition flex items-center gap-3 ${activeTab === 'members' ? 'bg-indigo-600 text-white' : 'hover:bg-white/10 text-gray-400'}`}><span>👥</span> 成员状态</button>

              <button onClick={() => setActiveTab('announcement')} className={`relative w-full text-left p-3 rounded-xl transition flex items-center gap-3 ${activeTab === 'announcement' ? 'bg-indigo-600 text-white' : 'hover:bg-white/10 text-gray-400'}`}>
                <span>📢</span> 公告栏
                {hasUnreadAnnouncement && <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>}
              </button>

              {myProfile?.role === 'admin' && (
                <>
                  <button onClick={() => setActiveTab('history')} className={`w-full text-left p-3 rounded-xl transition flex items-center gap-3 ${activeTab === 'history' ? 'bg-amber-600 text-white' : 'hover:bg-white/10 text-amber-400'}`}><span>📊</span> 签到历史</button>
                  <button onClick={() => setActiveTab('admin')} className={`w-full text-left p-3 rounded-xl transition flex items-center gap-3 ${activeTab === 'admin' ? 'bg-amber-600 text-white' : 'hover:bg-white/10 text-amber-400'}`}><span>🎟️</span> 生成邀请码</button>
                </>
              )}
            </div>

            <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-white/10">
              <button className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 font-bold p-3 rounded-xl shadow-lg" onClick={handleCheckIn}>快速签到</button>
              <button className="w-full bg-red-500/20 text-red-300 border border-red-500/30 p-3 rounded-xl text-sm" onClick={handleLogout}>退出登录</button>
            </div>
          </div>

          {/* 右侧：内容区 */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl w-full md:flex-1 flex flex-col overflow-hidden relative">

            {/* 1. 群聊 */}
            {activeTab === 'chat' && (
              <>
                <div className="p-4 border-b border-white/10 bg-black/20 flex justify-between items-center">
                  <h2 className="font-bold text-gray-200">💬 工作室大厅</h2>
                  <span className="text-xs text-gray-400">在线: {onlineUsers.length} 人</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                  {messages.length === 0 && <span className="text-gray-500 text-sm text-center mt-10">这里空空如也，快来说第一句话吧！</span>}
                  {messages.map((m) => {
                    const isMe = m.sender_nickname === (myProfile?.nickname || '未命名')
                    return (
                      <div key={m.id} className={`flex flex-col max-w-[80%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
                        <span className="text-xs text-gray-400 mb-1">{m.sender_nickname}</span>
                        <span className={`px-4 py-2 rounded-2xl ${isMe ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-sm' : 'bg-white/20 text-gray-100 rounded-tl-sm'}`}>{m.content}</span>
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

            {/* 2. 成员状态 */}
            {activeTab === 'members' && (
              <>
                <div className="p-4 border-b border-white/10 bg-black/20">
                  <h2 className="font-bold text-gray-200">👥 成员状态列表</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                  {allMembers.length === 0 && <span className="text-gray-500 text-sm text-center mt-10">加载成员数据中...</span>}

                  {[...allMembers]
                    .sort((a, b) => {
                      if (a.role === 'admin' && b.role !== 'admin') return -1;
                      if (a.role !== 'admin' && b.role === 'admin') return 1;
                      return 0;
                    })
                    .map((member) => {
                      const isOnline = onlineUsers.includes(member.id)
                      const hasCheckedIn = todayCheckIns.includes(member.id)
                      return (
                        <div key={member.id} className="bg-black/30 border border-white/10 p-4 rounded-xl flex items-center justify-between hover:bg-white/5 transition">
                          <div className="flex items-center gap-4">
                            <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-500'}`}></div>

                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white text-base">{member.nickname || '未命名'}</span>
                                <span className="text-xs font-normal text-gray-400">({member.username || '无真名'})</span>
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

            {/* 3. 公告栏 */}
            {activeTab === 'announcement' && (
              <>
                <div className="p-4 border-b border-white/10 bg-black/20">
                  <h2 className="font-bold text-gray-200">📢 工作室公告</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center">
                  <div className="w-full max-w-2xl bg-white/5 border border-white/10 p-8 rounded-2xl shadow-lg min-h-[200px]">
                    {myProfile?.role === 'admin' ? (
                      <>
                        <textarea className="w-full h-32 bg-black/40 border border-white/10 p-4 rounded-xl text-white resize-none focus:outline-none focus:border-amber-400 mb-4" placeholder="输入公告内容..." value={editAnnouncement} onChange={(e) => setEditAnnouncement(e.target.value)} />
                        <button className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-6 py-2 rounded-lg" onClick={saveAnnouncement}>发布新公告</button>
                      </>
                    ) : (
                      <div className="flex flex-col h-full">
                        <div className="text-gray-200 whitespace-pre-wrap text-lg leading-relaxed flex-1">
                          {announcement ? announcement.content : '暂无公告'}
                        </div>
                        
                        {announcement && (
                          <div className="mt-8 pt-4 border-t border-white/10 text-xs text-gray-400 text-right">
                            发布人：<span className="text-gray-300 font-bold">{announcement.profiles?.username || '管理员'}</span>
                            <span className="mx-2">|</span>
                            发布时间：{new Date(announcement.updated_at).toLocaleString('zh-CN', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* 4. 签到历史 (管理员) */}
            {activeTab === 'history' && myProfile?.role === 'admin' && (
              <>
                <div className="p-4 border-b border-white/10 bg-black/20 flex justify-between items-center">
                  <h2 className="font-bold text-gray-200">📊 每日签到报表</h2>
                  <input type="date" className="bg-black/40 border border-white/10 text-white px-3 py-1 rounded-lg" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
                </div>
                <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-4 border-r border-white/10">
                    <h3 className="text-sm font-bold text-gray-400 mb-3">当日成员签到情况</h3>
                    {historyData.length === 0 && <p className="text-gray-500 text-sm">加载中...</p>}
                    {historyData.map(m => (
                      <div key={m.id} onClick={() => fetchMemberHistory(m)} className={`cursor-pointer p-3 mb-2 rounded-xl border flex justify-between items-center transition ${selectedMember?.id === m.id ? 'bg-amber-900/40 border-amber-500/50' : 'bg-black/20 border-transparent hover:bg-white/10'}`}>
                        <span>{m.nickname || m.username}</span>
                        <span className={`text-xs ${m.hasCheckedIn ? 'text-emerald-400' : 'text-gray-500'}`}>{m.hasCheckedIn ? '✅ 已签' : '未签'}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 bg-black/10">
                    <h3 className="text-sm font-bold text-gray-400 mb-3">个人历史记录</h3>
                    {!selectedMember ? <p className="text-gray-500 text-sm">请在左侧点击成员查看</p> : (
                      <>
                        <p className="mb-4 text-amber-300">查看：{selectedMember.nickname || selectedMember.username}</p>
                        {memberHistory.map((h, i) => (
                          <div key={i} className="bg-black/30 px-4 py-2 rounded mb-2 text-sm border border-white/5">{h.check_in_date}</div>
                        ))}
                        {memberHistory.length === 0 && <p className="text-gray-500 text-sm">该成员暂无签到记录</p>}
                      </>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* 5. 生成邀请码 (管理员) */}
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

      {/* 左下角悬浮版本号 */}
      <div className="fixed bottom-4 left-4 text-xs text-gray-500 font-mono tracking-wider opacity-60 hover:opacity-100 transition-opacity z-50">
        v{packageJson.version}
      </div>
    </div>
  )
}