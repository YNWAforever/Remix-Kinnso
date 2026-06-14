import type { Messages } from './en'

const messages: Messages = {
  brand: 'Kinnso',
  categories: { destinations: 'จุดหมายปลายทาง', dining: 'ร้านอาหาร', shopping: 'ช้อปปิ้ง' },
  breadcrumb: { home: 'หน้าแรก', articles: 'บทความ' },
  article: { youMayLike: 'คุณอาจชอบ', faqTitle: 'คำถามที่พบบ่อย', tableOfContents: 'สารบัญ', by: 'โดย' },
  listing: { searchPlaceholder: 'ค้นหาบทความ', filterRegion: 'ภูมิภาค', filterTag: 'แท็ก', noResults: 'ไม่พบบทความ', resultsCount: 'บทความ' },
  pagination: { prev: 'ก่อนหน้า', next: 'ถัดไป', page: 'หน้า' },
  auth: {
    signIn: 'เข้าสู่ระบบ',
    signUp: 'สมัครสมาชิก',
    signOut: 'ออกจากระบบ',
    email: 'อีเมล',
    password: 'รหัสผ่าน',
    emailSent: 'ตรวจสอบอีเมลของคุณ',
    emailSentDesc: 'เราส่งลิงก์ยืนยันไปให้แล้ว คลิกเพื่อเปิดใช้งานบัญชีของคุณ',
    alreadyHaveAccount: 'มีบัญชีอยู่แล้วใช่ไหม?',
    noAccount: 'ยังไม่มีบัญชีใช่ไหม?',
    errorInvalidCredentials: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    errorEmailTaken: 'มีบัญชีที่ใช้อีเมลนี้อยู่แล้ว',
    errorGeneric: 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง',
    creatorDashboard: 'แดชบอร์ดผู้สร้าง',
    onboardingPlaceholder: 'วิซาร์ดการเตรียมความพร้อมจะมาในแผน 4',
  },
}
export default messages
