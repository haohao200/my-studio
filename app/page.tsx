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

  // 🎯 提示信息优化
  const [msg, setMsg] = useState('')
  const [isMsgVisible, setIsMsgVisible] = useState(false)
  const msgTimerRef = useRef<NodeJS.Timeout | null>(null)

  // --- 工具栏导航 ---
  const [activeTab, setActiveTab] = useState<'chat' | 'members' | 'admin' | 'history' | 'mailbox'>('chat')
  const [mailTab, setMailTab] = useState<'announcement' | 'inbox'>('announcement')
  const activeTabRef = useRef(activeTab)
  const mailTabRef = useRef(mailTab)

  // --- 聊天室 ---
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<any[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null) // 🎯 用于自动滚动的锚点

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

  // --- 邮箱相关 ---
  const [emails, setEmails] = useState<any[]>([])
  const [hasUnreadEmail, setHasUnreadEmail] = useState(false)
  const [selectedEmail, setSelectedEmail] = useState<any>(null)
  const [emailForm, setEmailForm] = useState({ receiver: null as any, title: '', content: '' })
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
  const [isSendingEmail, setIsSendingEmail] = useState(false) // 🎯 防手抖 Loading
  const [isSendingMessage, setIsSendingMessage] = useState(false) // 🎯 防手抖 Loading

  // --- 邮件删除相关状态 ---
  const [selectedEmailIds, setSelectedEmailIds] = useState<number[]>([]) // 存被勾选的邮件ID
  const [isDeleting, setIsDeleting] = useState(false) // 防手抖 Loading

  const DEBUG_EMAIL = 'haohao@studio.com'
  const DEBUG_PASSWORD = 'hh87872118'

  // 🎯 修复 1：统一获取当前用户的展示名称，保证发送和渲染比对时逻辑绝对一致
  const myDisplayName = myProfile?.nickname || myProfile?.username || '未命名'

  // ==================== 3. 生命周期 ====================
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
  useEffect(() => { mailTabRef.current = mailTab }, [mailTab])

  // 🎯 派生状态：自动计算红点
  useEffect(() => {
    setHasUnreadEmail(emails.some(e => !e.is_read))
  }, [emails])

  // 🎯 修复：ESC 键防误触丢失草稿
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedEmail) setSelectedEmail(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedEmail])

  // 🎯 防抖：定时器管理提示信息
  useEffect(() => {
    if (msg) {
      setIsMsgVisible(true)
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current)
      msgTimerRef.current = setTimeout(() => {
        setIsMsgVisible(false)
        setTimeout(() => {
          setMsg((prevMsg) => prevMsg === msg ? '' : prevMsg)
        }, 500)
      }, 2500)
      return () => {
        if (msgTimerRef.current) clearTimeout(msgTimerRef.current)
      }
    }
  }, [msg])

  // 🎯 修复：时区 Bug，使用本地时区初始化日期
  useEffect(() => {
    setMounted(true)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    setSelectedDate(`${year}-${month}-${day}`);
  }, [])

  // 🎯 优化：监听消息变化，自动滚到底部
  useEffect(() => {
    // 使用 'auto' 瞬间到底，避免多条消息同时到达时排队平滑滚动造成视觉晕眩
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [messages])

  // 初始化获取 Session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser(session.user)
    })
  }, [])

  // 🎯 修复 3：全局登录状态监听（防死循环，直接清理状态）
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        // 直接清理，不调用 handleLogout，防死循环
        setUser(null); setMyProfile(null); setMessages([]); setEmails([])
        setAnnouncement(null); setAllMembers([]); setOnlineUsers([])
        setHasUnreadAnnouncement(false); setHasUnreadEmail(false)
        setSelectedEmail(null); setIsEmailModalOpen(false)
      } else if (session?.user) {
        setUser(session.user)
      }
    })
    return () => subscription.unsubscribe()
  }, []) // 🎯 依赖留空，只挂载一次

  // 公告数据拉取逻辑
  const fetchLatestAnnouncement = async () => {
    let { data, error } = await supabase
      .from('announcements')
      .select('*, profiles(username)')
      .order('updated_at', { ascending: false })
      .limit(1)

    if (error) {
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

  const fetchEmails = async (userId: string) => {
    const { data } = await supabase.from('emails').select('*').eq('receiver_id', userId).order('created_at', { ascending: false })
    if (data) {
      setEmails(data)
    }
  }

  useEffect(() => {
    if (!user) return

    const initUserData = async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) {
        const profileData = { ...data, role: user.email === DEBUG_EMAIL ? 'admin' : data.role }
        setMyProfile(profileData)
        if (!data.nickname) setShowNicknameModal(true)

        const latest = await fetchLatestAnnouncement()
        if (latest && new Date(latest.updated_at) > new Date(profileData.last_read_announcement_at || '1970-01-01T00:00:00Z')) {
          setHasUnreadAnnouncement(true)
        }
        await fetchEmails(user.id)
      }
    }
    initUserData()

    supabase.from('profiles').update({ last_sign_in_at: new Date().toISOString() }).eq('id', user.id).then()

    // 1. Realtime 监听聊天
    const chatChannel = supabase.channel('studio-messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      setMessages((prev) => prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new])
    }).subscribe()

    // 2. Realtime 监听公告
    const announcementChannel = supabase.channel('studio-announcements').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, async () => {
      const latest = await fetchLatestAnnouncement()
      if (latest) {
        if (activeTabRef.current === 'mailbox' && mailTabRef.current === 'announcement') {
          setHasUnreadAnnouncement(false)
          const now = new Date().toISOString()
          await supabase.from('profiles').update({ last_read_announcement_at: now }).eq('id', user.id)
          setMyProfile((prev: any) => ({ ...prev, last_read_announcement_at: now }))
        } else {
          setHasUnreadAnnouncement(true)
        }
      }
    }).subscribe()

    // 3. Realtime 监听邮件
    const emailChannel = supabase.channel('studio-emails').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emails', filter: `receiver_id=eq.${user.id}` }, async (payload) => {
      const newEmail = payload.new
      if (activeTabRef.current === 'mailbox' && mailTabRef.current === 'inbox') {
        setEmails((prev) => [{ ...newEmail, is_read: true }, ...prev])
        await supabase.from('emails').update({ is_read: true }).eq('id', newEmail.id)
      } else {
        setEmails((prev) => [newEmail, ...prev])
      }
    }).subscribe()

    // 4. Presence 在线状态
    const presenceChannel = supabase.channel('studio-presence', { config: { presence: { key: user.id } } })
      .on('presence', { event: 'sync' }, () => setOnlineUsers(Object.keys(presenceChannel.presenceState())))
      .subscribe(async (status) => { if (status === 'SUBSCRIBED') await presenceChannel.track({ online_at: new Date().toISOString() }) })

    return () => {
      supabase.removeChannel(chatChannel);
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(announcementChannel);
      supabase.removeChannel(emailChannel)
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
    if (activeTab === 'history' && myProfile?.role === 'admin') fetchHistoryByDate(selectedDate)

    if (activeTab === 'mailbox') {
      if (mailTab === 'announcement') markAnnouncementAsRead()
      // 🎯 修复：切回收件箱时，主动拉取最新数据
      if (mailTab === 'inbox') {
        fetchEmails(user.id)
      }
    }
  }, [activeTab, mailTab, user, selectedDate, myProfile?.role])

  // ==================== 4. 核心逻辑 ====================

  const markAnnouncementAsRead = async () => {
    if (!hasUnreadAnnouncement) return
    const now = new Date().toISOString()
    await supabase.from('profiles').update({ last_read_announcement_at: now }).eq('id', user.id)
    setMyProfile((prev: any) => ({ ...prev, last_read_announcement_at: now }))
    setHasUnreadAnnouncement(false)
  }

  const handleOpenEmail = async (email: any) => {
    setSelectedEmail(email)
    if (!email.is_read) {
      await supabase.from('emails').update({ is_read: true }).eq('id', email.id)
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: true } : e))
    }
  }

  // 🎯 修复 2：try...finally 防止按钮死机
  const sendEmail = async () => {
    if (isSendingEmail) return
    if (!emailForm.receiver) return setMsg('请选择收件人')
    if (!emailForm.title.trim() || !emailForm.content.trim()) return setMsg('标题和内容不能为空')

    setIsSendingEmail(true)
    try {
      const { error } = await supabase.from('emails').insert({
        sender_id: user.id,
        sender_name: myDisplayName, // 🎯 使用全局变量
        receiver_id: emailForm.receiver.id,
        receiver_name: emailForm.receiver.nickname || emailForm.receiver.username,
        title: emailForm.title,
        content: emailForm.content
      })
      if (error) setMsg('发送失败：' + error.message)
      else {
        setMsg('邮件发送成功！')
        setIsEmailModalOpen(false)
        setEmailForm({ receiver: null, title: '', content: '' })
      }
    } catch (err) {
      setMsg('发送邮件异常，请检查网络')
    } finally {
      setIsSendingEmail(false)
    }
  }

  // 🎯 新增：删除单封邮件
  const deleteSingleEmail = async (emailId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation() // 防止点击删除时触发打开邮件的弹窗
    if (!confirm('确定要删除这封邮件吗？')) return

    setIsDeleting(true)
    const { error } = await supabase.from('emails').delete().eq('id', emailId)
    if (!error) {
      setEmails(prev => prev.filter(e => e.id !== emailId))
      setSelectedEmailIds(prev => prev.filter(id => id !== emailId))
      if (selectedEmail?.id === emailId) setSelectedEmail(null)
      setMsg('🗑️ 邮件已删除')
    } else {
      setMsg('删除失败：' + error.message)
    }
    setIsDeleting(false)
  }

  // 🎯 新增：批量删除选中的邮件
  const deleteSelectedEmails = async () => {
    if (selectedEmailIds.length === 0) return
    if (!confirm(`确定要删除选中的 ${selectedEmailIds.length} 封邮件吗？`)) return

    setIsDeleting(true)
    const { error } = await supabase.from('emails').delete().in('id', selectedEmailIds)
    if (!error) {
      setEmails(prev => prev.filter(e => !selectedEmailIds.includes(e.id)))
      setSelectedEmailIds([])
      setMsg('🗑️ 选中邮件已删除')
    } else {
      setMsg('删除失败：' + error.message)
    }
    setIsDeleting(false)
  }

  // 🎯 新增：一键清空所有邮件
  const deleteAllEmails = async () => {
    if (emails.length === 0) return
    if (!confirm('⚠️ 确定要清空收件箱的所有邮件吗？此操作不可恢复！')) return

    setIsDeleting(true)
    const { error } = await supabase.from('emails').delete().eq('receiver_id', user.id)
    if (!error) {
      setEmails([])
      setSelectedEmailIds([])
      setMsg('🗑️ 收件箱已清空')
    } else {
      setMsg('删除失败：' + error.message)
    }
    setIsDeleting(false)
  }

  // 🎯 新增：切换单个复选框
  const toggleSelectEmail = (id: number, e: React.MouseEvent) => {
    e.stopPropagation() // 防止触发打开邮件
    setSelectedEmailIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  // 🎯 新增：全选/取消全选
  const toggleSelectAll = () => {
    if (selectedEmailIds.length === emails.length) {
      setSelectedEmailIds([])
    } else {
      setSelectedEmailIds(emails.map(e => e.id))
    }
  }

  const saveAnnouncement = async () => {
    if (!editAnnouncement.trim()) return setMsg('公告内容不能为空')
    const { error } = await supabase.from('announcements').insert({ content: editAnnouncement.trim(), updated_by: user.id })
    if (!error) {
      setMsg('✅ 公告已发布');
      fetchLatestAnnouncement().then(() => setHasUnreadAnnouncement(false))
    }
  }

  const fetchHistoryByDate = async (date: string) => {
    setSelectedMember(null); setHistoryData([])
    const { data: checkins } = await supabase.from('check_ins').select('user_id').eq('check_in_date', date)
    const checkedIds = checkins?.map(c => c.user_id) || []
    const { data: profiles } = await supabase.from('profiles').select('*').order('role', { ascending: false })
    if (profiles) setHistoryData(profiles.map(p => ({ ...p, hasCheckedIn: checkedIds.includes(p.id) })))
  }

  const fetchMemberHistory = async (member: any) => {
    setSelectedMember(member)
    const { data } = await supabase.from('check_ins').select('check_in_date').eq('user_id', member.id).order('check_in_date', { ascending: false })
    if (data) setMemberHistory(data)
  }

  const fetchAllMembersData = async () => {
    const { data: profiles } = await supabase.from('profiles').select('*').order('created_at', { ascending: true })
    if (profiles) setAllMembers(profiles)
    const now = new Date(); const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const { data: checkins } = await supabase.from('check_ins').select('user_id').eq('check_in_date', todayStr)
    if (checkins) setTodayCheckIns(checkins.map(c => c.user_id))
  }

  const handleSaveNickname = async () => {
    if (!nickname.trim()) return setMsg('昵称不能为空')
    if (nickname.length > 15) return setMsg('昵称不能超过 15 个字符')
    const { data: existing } = await supabase.from('profiles').select('id').eq('nickname', nickname.trim()).maybeSingle()
    if (existing) return setMsg('该昵称已被占用，请换一个吧！')

    const { error } = await supabase.from('profiles').update({ nickname: nickname.trim() }).eq('id', user.id)
    if (!error) { setMyProfile({ ...myProfile, nickname: nickname.trim() }); setShowNicknameModal(false); setMsg('昵称设置成功！') }
    else { setMsg('保存失败：' + error.message) }
  }

  const executeLogin = async (email: string, pass: string) => {
    setMsg('正在验证...')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass })
    if (error) {
      let friendlyMessage = error.message;
      if (error.message === 'Invalid login credentials') friendlyMessage = '账号或密码错误，请重新输入。';
      else if (error.message === 'Failed to fetch') friendlyMessage = '网络连接失败，请检查网络。';
      setMsg('登录失败：' + friendlyMessage); setCaptchaToken(null)
    }
    else { setUser(data.user); setMsg('登录成功！') }
  }

  const doRealLogin = async (account: string, pass: string) => {
    if (/^\d{6}$/.test(account.trim())) executeLogin(`${account.trim()}@studio.com`, pass)
    else {
      setMsg('正在查找昵称...')
      const { data } = await supabase.from('profiles').select('email').eq('nickname', account.trim()).single()
      if (data) executeLogin(data.email, pass); else setMsg('找不到该昵称对应的账号')
    }
  }

  const handleLogin = (account: string, pass: string) => {
    if (!account || !pass) return setMsg('请填写完整')
    if (!captchaToken) { setPendingLogin({ account, password: pass }); setIsCaptchaOpen(true) }
    else doRealLogin(account, pass)
  }

  // 🎯 修复 4：登出时清空所有业务数据和草稿
  const handleLogout = async () => {
    if (user) {
      await supabase.from('profiles').update({ last_sign_out_at: new Date().toISOString() }).eq('id', user.id)
    }
    await supabase.auth.signOut()

    // 清空所有基础状态
    setUser(null); setMyProfile(null); setMessages([]); setCaptchaToken(null); setMsg('已退出')

    // 清空所有业务数据，防止切换账号时数据串号
    setEmails([])
    setAnnouncement(null)
    setAllMembers([])
    setOnlineUsers([])
    setTodayCheckIns([])
    setHistoryData([])
    setMemberHistory([])
    setSelectedMember(null)
    setHasUnreadAnnouncement(false)
    setHasUnreadEmail(false)

    // 🎯 清空草稿和弹窗状态
    setChatInput('')
    setSelectedEmail(null)
    setIsEmailModalOpen(false)
    setEmailForm({ receiver: null, title: '', content: '' })
    setIsSendingEmail(false)
    setIsSendingMessage(false)
    setShowNicknameModal(false)
    setNickname('')
  }

  const handleActivate = async () => {
    if (!activationCode.trim() || !newPassword.trim()) return setMsg('请填写激活码和新密码')
    if (newPassword.length < 6) return setMsg('密码不能少于6位')

    setMsg('正在验证...')
    const { data: codeData } = await supabase.from('activation_codes').select('*').eq('code', activationCode.trim().toUpperCase()).maybeSingle()
    if (!codeData) return setMsg('无效的激活码')
    if (codeData.is_used) return setMsg('该激活码已被使用')
    if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) return setMsg('激活码已过期')

    const newId = Math.floor(100000 + Math.random() * 900000).toString()
    const { error } = await supabase.auth.signUp({ email: `${newId}@studio.com`, password: newPassword, options: { data: { username: codeData.username } } })
    if (error) return setMsg('激活失败：' + error.message)

    await supabase.from('activation_codes').update({ is_used: true, assigned_account_id: newId }).eq('id', codeData.id)
    navigator.clipboard.writeText(newId).then(() => setMsg('激活成功！代号已复制到剪贴板。'))

    setJustActivated({ id: newId, name: codeData.username })
    setLoginMode('formal'); setAccountId(newId); setFormalPassword(newPassword); setActivationCode(''); setNewPassword('')
  }

  const generateCode = async () => {
    if (!newInviteUsername.trim()) return setMsg('请输入真名')
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase()
    const { error } = await supabase.from('activation_codes').insert({ code: randomCode, username: newInviteUsername.trim(), expires_at: new Date(Date.now() + 86400000).toISOString() })
    if (!error) {
      setLastGeneratedCode({ code: randomCode, name: newInviteUsername.trim() });
      setMsg('✅ 邀请码生成成功'); setNewInviteUsername('')
    }
  }

  // 🎯 修复 3：增加签到按钮的防御性判断
  const handleCheckIn = async () => {
    if (!user) return setMsg('登录状态已失效，请重新登录')
    const { error } = await supabase.from('check_ins').insert({ user_id: user.id })
    if (error) setMsg(error.code === '23505' ? '今天已经签过了' : '签到出错：' + error.message)
    else { setMsg(`签到成功！✅ ${myProfile?.username}`); fetchAllMembersData() }
  }

  // 🎯 修复 2：try...finally 防止按钮死机
  const sendMessage = async () => {
    if (!chatInput.trim() || isSendingMessage) return

    setIsSendingMessage(true)
    try {
      const { data, error } = await supabase.from('messages').insert({
        sender_id: user.id,
        sender_nickname: myDisplayName, // 🎯 使用全局变量
        content: chatInput
      }).select().single()
      if (!error && data) {
        setChatInput('');
        setMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data])
      }
    } catch (err) {
      setMsg('发送失败，请检查网络')
    } finally {
      setIsSendingMessage(false)
    }
  }

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text).then(() => setMsg('📋 已复制'))

  // 🎯 修复：时间格式化防崩溃
  const getOfflineTime = (time: string | null | undefined) => {
    if (!time) return '未知'
    const targetTime = new Date(time).getTime()
    if (isNaN(targetTime)) return '未知'

    const diffMs = new Date().getTime() - targetTime
    const days = Math.floor(diffMs / 86400000)
    if (days > 30) return '离线'
    if (days > 0) return `离线 ${days}天`
    const hours = Math.floor(diffMs / 3600000)
    if (hours > 0) return `离线 ${hours}小时`
    return `离线 ${Math.floor(diffMs / 60000)}分钟`
  }

  const formatTime = (time: string) => {
    if (!time) return '未知时间';
    const date = new Date(time);
    if (isNaN(date.getTime())) return '格式错误';
    return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  }

  // ==================== 5. UI 渲染 ====================
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-black flex flex-col items-center justify-center p-4 text-white relative">

      {/* 顶部提示 */}
      <div className={`fixed top-4 bg-indigo-500/90 border border-indigo-400/50 backdrop-blur-md px-6 py-2.5 rounded-full shadow-2xl z-[200] text-sm font-medium text-white transition-all duration-500 ease-out transform ${isMsgVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-4 scale-95 pointer-events-none'}`}>{msg}</div>

      {!user ? (
        // ==================== 5.1 登录页 ====================
        <div className="bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-2xl shadow-2xl w-full max-w-md">
          <h1 className="text-3xl font-extrabold mb-6 text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">奇幻工作室</h1>
          <div className="flex bg-black/30 rounded-lg p-1 mb-6 text-sm">
            <button onClick={() => setLoginMode('formal')} className={`flex-1 py-2 rounded-md transition ${loginMode === 'formal' ? 'bg-indigo-600 font-bold' : 'text-gray-400'}`}>正式登录</button>
            <button onClick={() => setLoginMode('activate')} className={`flex-1 py-2 rounded-md transition ${loginMode === 'activate' ? 'bg-indigo-600 font-bold' : 'text-gray-400'}`}>激活码激活</button>
            <button onClick={() => setLoginMode('temp')} className={`flex-1 py-2 rounded-md transition ${loginMode === 'temp' ? 'bg-indigo-600 font-bold' : 'text-gray-400'}`}>临时登录</button>
          </div>
          <div className="flex flex-col gap-4">
            {loginMode === 'formal' && (
              <>
                {justActivated && <div className="mb-2 p-4 bg-emerald-900/40 border border-emerald-500/50 rounded-xl"><p className="text-sm text-emerald-200 mb-2 text-center">🎉 欢迎，{justActivated.name}！</p><div className="flex gap-2"><input type="text" readOnly value={justActivated.id} className="flex-1 bg-black/50 text-emerald-300 font-mono text-center font-bold rounded py-2" /><button onClick={() => copyToClipboard(justActivated.id)} className="bg-emerald-500 text-black font-bold px-4 py-2 rounded">复制</button></div></div>}
                <input className="bg-black/20 border border-white/10 p-3 rounded-lg text-white" placeholder="输入专属代号或昵称" value={accountId} onChange={(e) => setAccountId(e.target.value)} />
                <input
                  className="bg-black/20 border border-white/10 p-3 rounded-lg text-white"
                  placeholder="输入密码"
                  type="password"
                  value={formalPassword}
                  onChange={(e) => setFormalPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      handleLogin(accountId, formalPassword)
                    }
                  }}
                />
                <button className="bg-gradient-to-r from-blue-600 to-purple-600 font-bold p-3 rounded-lg mt-2" onClick={() => handleLogin(accountId, formalPassword)}>进入工作站</button>
              </>
            )}
            {loginMode === 'activate' && (
              <>
                <input className="bg-black/20 border border-white/10 p-3 rounded-lg text-white" placeholder="输入激活码" value={activationCode} onChange={(e) => setActivationCode(e.target.value)} />
                <input
                  className="bg-black/20 border border-white/10 p-3 rounded-lg text-white"
                  placeholder="设置密码"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      handleActivate()
                    }
                  }}
                />
                <button className="bg-gradient-to-r from-emerald-500 to-teal-600 font-bold p-3 rounded-lg mt-2" onClick={handleActivate}>激活并生成代号</button>
              </>
            )}
            {loginMode === 'temp' && (
              <>
                <input className="bg-black/20 border border-white/10 p-3 rounded-lg text-white" placeholder="测试邮箱" value={tempEmail} onChange={(e) => setTempEmail(e.target.value)} />
                <input
                  className="bg-black/20 border border-white/10 p-3 rounded-lg text-white"
                  placeholder="测试密码"
                  type="password"
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      handleLogin(tempEmail, tempPassword)
                    }
                  }}
                />
                <button className="bg-gray-600 font-bold p-3 rounded-lg mt-2" onClick={() => handleLogin(tempEmail, tempPassword)}>临时进入</button>
              </>
            )}
          </div>
          {mounted && typeof window !== 'undefined' && (<CaptchaModal open={isCaptchaOpen} onOpenChange={setIsCaptchaOpen} apiBaseUrl={window.location.origin} onSuccess={(token) => { setCaptchaToken(token); setMsg('验证成功！'); setIsCaptchaOpen(false); if (loginMode === 'formal' && pendingLogin) { doRealLogin(pendingLogin.account, pendingLogin.password); setPendingLogin(null) } else if (loginMode === 'temp') executeLogin(tempEmail, tempPassword) }} onError={() => setMsg('验证失败！')} title="安全验证" />)}
        </div>
      ) : (
        // ==================== 5.2 已登录主界面 ====================
        <div className="w-full max-w-6xl flex flex-col md:flex-row gap-6 h-[85vh]">

          {/* 左侧工具栏 */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-2xl w-full md:w-64 flex flex-col">
            <h1 className="text-2xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">奇幻工作室</h1>
            <div className="flex flex-col gap-1 mb-8">
              <span className="text-gray-400 text-xs uppercase tracking-wider mb-1">当前身份</span>
              <span className="font-medium text-lg text-white break-all">{myProfile?.nickname || '加载中...'}</span>
              <span className="text-xs text-gray-500">真名: {myProfile?.username || '无'}</span>
              {myProfile?.role === 'admin' && <span className="w-max mt-1 bg-yellow-500/20 text-yellow-300 text-xs px-2 py-1 rounded border border-yellow-500/50">👑 管理员</span>}
            </div>

            <div className="flex-1 flex flex-col gap-2">
              <button onClick={() => setActiveTab('chat')} className={`w-full text-left p-3 rounded-xl transition flex items-center gap-3 ${activeTab === 'chat' ? 'bg-indigo-600 text-white' : 'hover:bg-white/10 text-gray-400'}`}><span>💬</span> 工作室群聊</button>
              <button onClick={() => setActiveTab('members')} className={`w-full text-left p-3 rounded-xl transition flex items-center gap-3 ${activeTab === 'members' ? 'bg-indigo-600 text-white' : 'hover:bg-white/10 text-gray-400'}`}><span>👥</span> 成员状态</button>

              {/* 合并的公告与邮箱入口 */}
              <button onClick={() => setActiveTab('mailbox')} className={`relative w-full text-left p-3 rounded-xl transition flex items-center gap-3 ${activeTab === 'mailbox' ? 'bg-indigo-600 text-white' : 'hover:bg-white/10 text-gray-400'}`}>
                <span>📢</span> 公告与邮箱
                {(hasUnreadAnnouncement || hasUnreadEmail) && <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>}
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

          {/* 右侧内容区 */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl w-full md:flex-1 flex flex-col overflow-hidden relative">

            {/* 1. 群聊 */}
            {activeTab === 'chat' && (
              <>
                <div className="p-4 border-b border-white/10 bg-black/20 flex justify-between items-center"><h2 className="font-bold text-gray-200">💬 工作室大厅</h2><span className="text-xs text-gray-400">在线: {onlineUsers.length} 人</span></div>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                  {messages.length === 0 && <span className="text-gray-500 text-sm text-center mt-10">暂无消息</span>}
                  {messages.map((m) => {
                    const isMe = m.sender_nickname === myDisplayName // 🎯 使用全局变量
                    return (
                      <div key={m.id} className={`flex flex-col max-w-[80%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
                        <span className="text-xs text-gray-400 mb-1">{m.sender_nickname}</span>
                        <span className={`px-4 py-2 rounded-2xl ${isMe ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-sm' : 'bg-white/20 text-gray-100 rounded-tl-sm'}`}>{m.content}</span>
                      </div>
                    )
                  })}
                  {/* 🎯 用于自动滚动的锚点 */}
                  <div ref={messagesEndRef} />
                </div>
                <div className="p-4 bg-black/20 border-t border-white/10 flex gap-3">
                  <input
                    className="flex-1 bg-black/40 border border-white/10 p-3 rounded-xl text-white"
                    placeholder="输入你想说的话..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing && !isSendingMessage) {
                        sendMessage();
                      }
                    }}
                  />
                  <button
                    className={`text-white px-6 py-2 rounded-xl font-medium transition ${isSendingMessage ? 'bg-gray-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500'}`}
                    onClick={sendMessage}
                    disabled={isSendingMessage}
                  >
                    {isSendingMessage ? '发送中' : '发送'}
                  </button>
                </div>
              </>
            )}

            {/* 2. 成员状态 */}
            {activeTab === 'members' && (
              <>
                <div className="p-4 border-b border-white/10 bg-black/20"><h2 className="font-bold text-gray-200">👥 成员状态列表</h2></div>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                  {[...allMembers].sort((a, b) => (a.role === 'admin' && b.role !== 'admin' ? -1 : 1)).map((member) => {
                    const isOnline = onlineUsers.includes(member.id)
                    const hasCheckedIn = todayCheckIns.includes(member.id)
                    const isSelf = member.id === user.id
                    return (
                      <div key={member.id} className="bg-black/30 border border-white/10 p-4 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-500'}`}></div>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-base">{member.nickname || '未命名'}</span>
                              <span className="text-xs font-normal text-gray-400">({member.username || '无真名'})</span>
                              {member.role === 'admin' && <span className="bg-yellow-500/20 text-yellow-300 text-[10px] px-2 py-0.5 rounded border border-yellow-500/50">👑 管理员</span>}
                            </div>
                            <div className="text-xs text-gray-400 flex gap-4 mt-1">
                              <span>上次登录: {member.last_sign_in_at ? new Date(member.last_sign_in_at).toLocaleDateString() : '从未'}</span>
                              <span>{isOnline ? '当前在线' : getOfflineTime(member.last_sign_out_at)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {/* 发邮件图标 (不能发给自己) */}
                          {!isSelf && (
                            <button onClick={() => { setEmailForm({ receiver: member, title: '', content: '' }); setIsEmailModalOpen(true); }} className="text-gray-400 hover:text-indigo-400 transition" title="发送内部邮件">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" /><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" /></svg>
                            </button>
                          )}
                          {hasCheckedIn ? <span className="bg-emerald-500/20 text-emerald-300 text-xs px-3 py-1 rounded-full border border-emerald-500/50">已签到</span> : <span className="bg-gray-500/20 text-gray-400 text-xs px-3 py-1 rounded-full border border-gray-500/50">未签到</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* 3. 公告与邮箱 */}
            {activeTab === 'mailbox' && (
              <>
                <div className="p-4 border-b border-white/10 bg-black/20 flex justify-between items-center">
                  <div className="flex gap-4">
                    <button onClick={() => setMailTab('announcement')} className={`font-bold pb-2 transition ${mailTab === 'announcement' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400'}`}>📢 公告栏</button>
                    <button onClick={() => setMailTab('inbox')} className={`relative font-bold pb-2 transition ${mailTab === 'inbox' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400'}`}>
                      📥 收件箱
                      {hasUnreadEmail && <span className="absolute top-0 -right-3 w-2 h-2 bg-red-500 rounded-full"></span>}
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                  {/* 公告子页面 */}
                  {mailTab === 'announcement' && (
                    <div className="w-full max-w-2xl mx-auto bg-white/5 border border-white/10 p-8 rounded-2xl shadow-lg min-h-[200px] mt-4">
                      {myProfile?.role === 'admin' ? (
                        <><textarea className="w-full h-32 bg-black/40 border border-white/10 p-4 rounded-xl text-white resize-none focus:outline-none focus:border-amber-400 mb-4" placeholder="输入公告内容..." value={editAnnouncement} onChange={(e) => setEditAnnouncement(e.target.value)} /><button className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-6 py-2 rounded-lg" onClick={saveAnnouncement}>发布新公告</button></>
                      ) : (
                        <div className="flex flex-col h-full">
                          <div className="text-gray-200 whitespace-pre-wrap text-lg leading-relaxed flex-1">{announcement ? announcement.content : '暂无公告'}</div>
                          {announcement && <div className="mt-8 pt-4 border-t border-white/10 text-xs text-gray-400 text-right">发布人：<span className="text-gray-300 font-bold">{announcement.profiles?.username || '管理员'}</span> <span className="mx-2">|</span> 发布时间：{formatTime(announcement.updated_at)}</div>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 收件箱子页面 */}
                  {mailTab === 'inbox' && (
                    <div className="w-full max-w-3xl mx-auto flex flex-col gap-2 mt-2">
                      
                      {/* 🎯 顶部工具栏 */}
                      <div className="flex items-center justify-between bg-black/20 p-2 rounded-lg border border-white/10 mb-2">
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300 hover:text-white ml-2">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 rounded border-gray-500 text-indigo-600 focus:ring-indigo-500"
                            checked={emails.length > 0 && selectedEmailIds.length === emails.length}
                            onChange={toggleSelectAll}
                          />
                          全选
                        </label>
                        <div className="flex gap-2">
                          <button 
                            onClick={deleteSelectedEmails}
                            disabled={selectedEmailIds.length === 0 || isDeleting}
                            className={`px-3 py-1.5 rounded text-xs font-bold transition ${selectedEmailIds.length > 0 && !isDeleting ? 'bg-red-500/80 hover:bg-red-500 text-white' : 'bg-gray-600/50 text-gray-400 cursor-not-allowed'}`}
                          >
                            删除选中 ({selectedEmailIds.length})
                          </button>
                          <button 
                            onClick={deleteAllEmails}
                            disabled={emails.length === 0 || isDeleting}
                            className={`px-3 py-1.5 rounded text-xs font-bold transition ${emails.length > 0 && !isDeleting ? 'bg-red-900/50 hover:bg-red-800 text-red-300 border border-red-500/30' : 'bg-gray-600/50 text-gray-400 cursor-not-allowed'}`}
                          >
                            一键清空
                          </button>
                        </div>
                      </div>

                      {emails.length === 0 && <p className="text-gray-500 text-center mt-10">收件箱空空如也</p>}
                      
                      {emails.map(email => {
                        const isChecked = selectedEmailIds.includes(email.id)
                        return (
                          <div key={email.id} onClick={() => handleOpenEmail(email)} className={`cursor-pointer p-4 rounded-xl border flex items-center justify-between transition ${!email.is_read ? 'bg-indigo-900/30 border-indigo-500/50 hover:bg-indigo-900/50' : 'bg-black/20 border-white/5 hover:bg-white/10'}`}>
                            
                            <div className="flex items-center gap-4">
                              {/* 🎯 复选框 */}
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 rounded border-gray-500 text-indigo-600 focus:ring-indigo-500"
                                checked={isChecked}
                                onChange={() => {}} // 由 onClick 代理
                                onClick={(e) => toggleSelectEmail(email.id, e)}
                              />
                              
                              <div className="flex flex-col gap-1">
                                <span className={`font-bold ${!email.is_read ? 'text-white' : 'text-gray-400'}`}>{email.title}</span>
                                <span className="text-xs text-gray-500">发件人: {email.sender_name}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-4">
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-xs text-gray-500">{formatTime(email.created_at)}</span>
                                {!email.is_read && <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full">未读</span>}
                              </div>
                              {/* 🎯 单封删除按钮 */}
                              <button 
                                onClick={(e) => deleteSingleEmail(email.id, e)}
                                className="text-gray-500 hover:text-red-400 transition p-1"
                                title="删除此邮件"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                            
                          </div>
                        )
                      })}
                    </div>
                  )}
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
                    {historyData.map(m => (
                      <div key={m.id} onClick={() => fetchMemberHistory(m)} className={`cursor-pointer p-3 mb-2 rounded-xl border flex justify-between items-center transition ${selectedMember?.id === m.id ? 'bg-amber-900/40 border-amber-500/50' : 'bg-black/20 border-transparent hover:bg-white/10'}`}>
                        <span>{m.nickname || m.username}</span>
                        <span className={`text-xs ${m.hasCheckedIn ? 'text-emerald-400' : 'text-gray-500'}`}>{m.hasCheckedIn ? '✅ 已签' : '未签'}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 bg-black/10">
                    <h3 className="text-sm font-bold text-gray-400 mb-3">个人历史记录</h3>
                    {!selectedMember ? (
                      <p className="text-gray-500 text-sm">请在左侧点击成员查看</p>
                    ) : (
                      <>
                        <p className="mb-4 text-amber-300">查看：{selectedMember.nickname || selectedMember.username}</p>
                        {memberHistory.map((h, i) => (
                          <div key={i} className="bg-black/30 px-4 py-2 rounded mb-2 text-sm border border-white/5">{h.check_in_date}</div>
                        ))}
                        {memberHistory.length === 0 && (
                          <p className="text-gray-500 text-sm">该成员暂无签到记录</p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* 5. 生成邀请码 (管理员) */}
            {activeTab === 'admin' && myProfile?.role === 'admin' && (
              <>
                <div className="p-4 border-b border-white/10 bg-black/20"><h2 className="font-bold text-gray-200">🎟️ 邀请码管理</h2></div>
                <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center">
                  <div className="w-full max-w-md bg-black/30 p-6 rounded-2xl border border-white/10 shadow-lg">
                    <h3 className="text-lg font-bold mb-4 text-amber-300">生成新邀请码</h3>
                    <p className="text-xs text-gray-400 mb-4">邀请码有效期为 24 小时。请在此输入新成员的真名，生成后将邀请码发给对方。</p>
                    <input className="w-full bg-black/40 border border-white/10 p-3 rounded-lg text-white mb-4 focus:outline-none focus:border-amber-400" placeholder="输入该成员的真名" value={newInviteUsername} onChange={(e) => setNewInviteUsername(e.target.value)} />
                    <button className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold p-3 rounded-lg transition-colors" onClick={generateCode}>生成邀请码</button>
                    {lastGeneratedCode.code && (
                      <div className="mt-6 p-4 bg-amber-900/30 border border-amber-500/50 rounded-xl"><p className="text-sm text-amber-200 mb-3">刚生成的激活码 (发给 <strong className="text-white">{lastGeneratedCode.name}</strong>)：</p><div className="flex gap-2 items-center w-full"><input type="text" readOnly value={lastGeneratedCode.code} className="flex-1 w-full min-w-0 bg-black/50 text-amber-300 font-mono text-center font-bold text-xl rounded py-2" /><button onClick={() => copyToClipboard(lastGeneratedCode.code)} className="flex-shrink-0 bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded transition">复制</button></div></div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 邮件详情弹窗 (ESC 可关闭) */}
      {selectedEmail && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-gray-900 border border-white/20 p-8 rounded-2xl shadow-2xl w-full max-w-lg relative">
            <button onClick={() => setSelectedEmail(null)} className="absolute top-4 right-4 text-gray-400 hover:text-white transition">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="text-xl font-bold mb-2 text-indigo-300 pr-8">{selectedEmail.title}</h2>
            <div className="text-xs text-gray-500 mb-6 flex justify-between border-b border-white/10 pb-4">
              <span>发件人: {selectedEmail.sender_name}</span>
              <span>{formatTime(selectedEmail.created_at)}</span>
            </div>
            
            <div className="text-gray-200 whitespace-pre-wrap leading-relaxed max-h-[50vh] overflow-y-auto mb-6">{selectedEmail.content}</div>
            
            {/* 🎯 详情弹窗里的删除按钮 */}
            <div className="flex justify-end border-t border-white/10 pt-4">
              <button 
                onClick={() => deleteSingleEmail(selectedEmail.id)} 
                disabled={isDeleting}
                className="px-6 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/40 transition"
              >
                删除此邮件
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 发送邮件弹窗 */}
      {isEmailModalOpen && emailForm.receiver && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-gray-900 border border-white/20 p-8 rounded-2xl shadow-2xl w-full max-w-lg relative">
            <h2 className="text-xl font-bold mb-4 text-emerald-400">发送新邮件</h2>
            <div className="flex flex-col gap-4">
              <div className="flex gap-2 items-center bg-black/40 border border-white/10 p-3 rounded-lg">
                <span className="text-sm text-gray-400">收件人:</span>
                <span className="font-bold text-white">{emailForm.receiver.nickname || emailForm.receiver.username}</span>
                <span className="text-xs text-gray-500">({emailForm.receiver.username})</span>
              </div>
              <input className="bg-black/40 border border-white/10 p-3 rounded-lg text-white focus:outline-none focus:border-indigo-400" placeholder="请输入邮件标题..." value={emailForm.title} onChange={(e) => setEmailForm({ ...emailForm, title: e.target.value })} />
              <textarea className="w-full h-40 bg-black/40 border border-white/10 p-4 rounded-xl text-white resize-none focus:outline-none focus:border-indigo-400" placeholder="请输入邮件内容..." value={emailForm.content} onChange={(e) => setEmailForm({ ...emailForm, content: e.target.value })} />
              <div className="flex justify-end gap-3 mt-2">
                <button onClick={() => setIsEmailModalOpen(false)} className="px-6 py-2 rounded-lg text-gray-400 hover:text-white transition">取消</button>
                <button
                  onClick={sendEmail}
                  disabled={isSendingEmail}
                  className={`text-white font-bold px-8 py-2 rounded-lg transition ${isSendingEmail ? 'bg-gray-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500'}`}
                >
                  {isSendingEmail ? '发送中...' : '发送'}
                </button>
              </div>
            </div>
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

      {!user && <button onClick={() => executeLogin(DEBUG_EMAIL, DEBUG_PASSWORD)} className="fixed bottom-6 right-6 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-full shadow-2xl text-sm z-50">⚡ 一键调试登录</button>}
      <div className="fixed bottom-4 left-4 text-xs text-gray-500 font-mono tracking-wider opacity-60 hover:opacity-100 transition-opacity z-50">v{packageJson.version}</div>
    </div>
  )
}