/* 优坐标 · 约课演示数据层（家长端 / 教师端共用）
   规则：
   1) 每课时按 45 分钟计；默认每节约 1.5 小时（2 课时），教师确认排课后按该节实际课时冻结，剩余可用课时同步减少；
   2) 第三方签到回调成功后才真正扣减（已上课时按该节实际课时增加）；
   3) 取消 / 拒绝立即解冻，不扣课时；
   4) 约课流程本身不做单独改约（改期统一走第 10 条请假），取消后重新约课；
   5) 老师用“四类时间 + 特殊日期”维护可约时段：四类时间长期生效，特殊日期只覆盖某一天；
   6) 家长端先确认老师：默认推荐“以前给该学员上过这门课”的老师，首次约课系统自动匹配，均支持更换；老师卡片展示其空闲时间段；
   7) 选时间支持批量：单次 / 每周同一时间连约 4 次 / 每天同一时间连约 7 天；逐节校验老师开放且未被约，不可约的日期自动跳过；
   8) 家长端「上课记录」为家长唯一入口：融合约课与上课记录，按 全部课程 / 待上课 / 待确认 / 待评价 / 已完成 / 已取消 六类查看，
      状态流转 pending → confirmed → attended（签到成功、扣课时、待评价）→ done（老师提交反馈后完成），cancelled 由家长取消或老师拒绝产生；
   9) 指定老师固定周课：老师确认接单即生效并生成每节课（不须家长二次确认）；发布需求固定周课：老师接单后仍须家长确认；
  10) 待上课可请假：家长/老师均可发起，填写原因后选择「调整上课时间」（须直接选好新时段）或「直接取消本次排课」；
      提交后由另一方确认，对方只能「按新时间确认」或「直接取消课程」（不设拒绝）；改期成功后课时继续冻结，
      取消后归还冻结课时（解冻，不产生扣减）；距开课不足 2 小时不允许发起；发起方可在对方响应前撤回；
      调课时新时段不能与原时间完全相同，可调日期/时段不含本次课自身占用的时段。 */
(function () {
  'use strict';

  var STORE_KEY = 'yzb-booking-v17';   // 演示数据基线；如需把原型恢复到初始状态，递增这个版本号即可
  var PURCHASED_HOURS = 96;
  var BASE_USED_HOURS = 35;      // 约课功能上线前的已上课时（其余课时由下方已上课 / 已完成记录按每节课时扣减）
  var MINUTES_PER_LESSON = 45;   // 1 课时 = 45 分钟
  var DEFAULT_CLASS_MINUTES = 90; // 默认每节 1.5 小时
  var DEFAULT_CLASS_LESSONS = DEFAULT_CLASS_MINUTES / MINUTES_PER_LESSON; // 1.5 小时 = 2 课时
  var LEGACY_LESSONS_PER_BOOKING = 1; // 历史演示数据没有 lessons 字段，按 1 课时计

  var TEACHERS = [
    { id: 'zhang',    name: '张三老师', avatar: '张', subjects: ['数学'], grades: ['高一', '高二', '高三'], years: 8,  score: 4.9, lessons: 128, modes: ['线上', '线下', '上门'], intro: '高中数学 · 函数与数列专题' },
    { id: 'liming',   name: '李明老师', avatar: '李', subjects: ['数学'], grades: ['高一', '高二'],        years: 6,  score: 4.8, lessons: 96,  modes: ['线上', '线下'],        intro: '高中数学 · 立体几何与解析几何' },
    { id: 'wangjing', name: '王静老师', avatar: '王', subjects: ['数学'], grades: ['高一'],                years: 5,  score: 4.9, lessons: 78,  modes: ['线上', '线下'],        intro: '高中数学 · 概率统计与基础巩固' },
    { id: 'zhaolei',  name: '赵磊老师', avatar: '赵', subjects: ['数学'], grades: ['高二', '高三'],        years: 10, score: 4.7, lessons: 210, modes: ['线上', '线下', '上门'], intro: '高中数学 · 导数与高考冲刺' },
    { id: 'chenyu',   name: '陈雨老师', avatar: '陈', subjects: ['数学'], grades: ['初一', '初二', '初三'], years: 4,  score: 4.8, lessons: 64,  modes: ['线下'],                intro: '初中数学 · 同步提高' },
    { id: 'liuwen',   name: '刘文老师', avatar: '刘', subjects: ['语文'], grades: ['高一'],                years: 7,  score: 4.9, lessons: 112, modes: ['线上', '线下'],        intro: '高中语文 · 阅读与写作' },
    { id: 'zhoumin',  name: '周敏老师', avatar: '周', subjects: ['英语'], grades: ['高一'],                years: 6,  score: 4.8, lessons: 98,  modes: ['线上', '上门'],        intro: '高中英语 · 语法与阅读' }
  ];

  var COURSES = [
    { id: 'function', name: '高中数学', subject: '数学', grade: '高一', mode: '线下', place: '西安小寨校区' },
    { id: 'sequence', name: '高中语文', subject: '语文', grade: '高一', mode: '线上', place: '西安小寨交付中心' },
    { id: 'tutorial', name: '高中英语', subject: '英语', grade: '高一', mode: '上门', place: '上门' }
  ];

  var MODE_PLACE = { '线上': '西安小寨交付中心', '线下': '西安小寨校区', '上门': '上门' };

  var DEMO_TODAY = '2026-08-10';      // 原型演示“今天”（周一）
  var BOOKING_WEEKS = 4;              // 家长端最多可约未来 4 周
  var WEEK_TEXT = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  function pad2(value) { return value < 10 ? '0' + value : String(value); }
  function parseKey(value) { var parts = String(value).split('-'); return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])); }
  function keyOf(date) { return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()); }

  // 可约窗口：从“明天”起未来 4 周（28 天）
  var DAYS = (function () {
    var start = parseKey(DEMO_TODAY);
    var list = [];
    for (var index = 0; index < BOOKING_WEEKS * 7; index += 1) {
      var current = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index + 1);
      list.push({
        date: keyOf(current),
        label: (current.getMonth() + 1) + '月' + current.getDate() + '日',
        week: WEEK_TEXT[(current.getDay() + 6) % 7],
        weekday: (current.getDay() + 6) % 7,
        weekIndex: Math.floor(index / 7)
      });
    }
    return list;
  })();

  // 时间轴：每天 08:00 — 23:30，每 30 分钟一档（共 32 档）
  var TIME_START_MINUTES = 8 * 60;
  var TIME_END_MINUTES = 23 * 60 + 30;
  var TIME_STEP_MINUTES = 30;
  var TIMES = (function () {
    var list = [];
    for (var minute = TIME_START_MINUTES; minute <= TIME_END_MINUTES; minute += TIME_STEP_MINUTES) {
      list.push(pad2(Math.floor(minute / 60)) + ':' + pad2(minute % 60));
    }
    return list;
  })();

  // 已有排课 / 已被占用（教师|日期|时间）
  var BUSY = {
    'zhang|2026-08-11|09:00': 1,
    'zhang|2026-08-13|19:00': 1,
    'liming|2026-08-12|14:00': 1,
    'liming|2026-08-15|19:00': 1,
    'wangjing|2026-08-15|10:30': 1,
    'wangjing|2026-08-12|19:00': 1,
    'zhang|2026-08-14|15:30': 1
  };

  var SEED = [
    /* ===== 固定周课表：需求单（未接单，出现在抢单大厅）===== */
    {
      id: 'PL20260810001', isPlan: true, orderMode: 'demand', student: '王子涵', courseId: 'function', courseName: '高中数学', subject: '数学', grade: '高一',
      teacherId: '', teacherName: '待匹配', teacherAccepted: false, startDate: '2026-09-01', endDate: '2027-01-15',
      weeklySlots: [{ weekday: 1, time: '19:00' }, { weekday: 5, time: '10:00' }],
      scheduleLabel: '每周二 19:00 · 每周六 10:00', sessionCount: 39, lessons: 78,
      lessonMinutes: 90, durationLabel: '1.5 小时/次', mode: '线下', place: '西安小寨校区', remark: '希望固定每周两次',
      status: 'pending', occurrences: [], createdAt: '8月10日 21:10', acceptedAt: '', confirmedAt: '', deducted: false, cancelReason: '', cancelledBy: ''
    },
    /* ===== 固定周课表：需求单（老师已接单，等待家长确认）===== */
    {
      id: 'PL20260809002', isPlan: true, orderMode: 'demand', student: '王子涵', courseId: 'tutorial', courseName: '高中英语', subject: '英语', grade: '高一',
      teacherId: 'zhang', teacherName: '张三老师', teacherAccepted: true, startDate: '2026-09-01', endDate: '2027-01-15',
      weeklySlots: [{ weekday: 5, time: '14:00' }],
      scheduleLabel: '每周六 14:00', sessionCount: 19, lessons: 38,
      lessonMinutes: 90, durationLabel: '1.5 小时/次', mode: '线上', place: '西安小寨交付中心', remark: '',
      status: 'pending', occurrences: [], createdAt: '8月9日 20:40', acceptedAt: '8月9日 21:00', confirmedAt: '', deducted: false, cancelReason: '', cancelledBy: ''
    },
    /* ===== 固定周课表：指定老师（老师尚未确认）===== */
    {
      id: 'PL20260808003', isPlan: true, orderMode: 'designated', student: '王子涵', courseId: 'function', courseName: '高中数学', subject: '数学', grade: '高一',
      teacherId: 'liming', teacherName: '李明老师', teacherAccepted: false, startDate: '2026-09-01', endDate: '2027-01-15',
      weeklySlots: [{ weekday: 2, time: '19:00' }],
      scheduleLabel: '每周三 19:00', sessionCount: 20, lessons: 40,
      lessonMinutes: 90, durationLabel: '1.5 小时/次', mode: '线下', place: '西安小寨校区', remark: '', status: 'pending',
      occurrences: [], createdAt: '8月8日 19:30', acceptedAt: '', confirmedAt: '', deducted: false, cancelReason: '', cancelledBy: ''
    },
    /* ===== 固定周课表：指定老师（已确认生效，已拆成每节课，本单不再单独展示）===== */
    {
      id: 'PL20260728004', isPlan: true, orderMode: 'designated', student: '王子涵', courseId: 'function', courseName: '高中数学', subject: '数学', grade: '高一',
      teacherId: 'zhang', teacherName: '张三老师', teacherAccepted: true, startDate: '2026-07-20', endDate: '2026-09-30',
      weeklySlots: [{ weekday: 4, time: '19:00' }],
      scheduleLabel: '每周五 19:00', sessionCount: 11, lessons: 22,
      lessonMinutes: 90, durationLabel: '1.5 小时/次', mode: '线下', place: '西安小寨校区', remark: '', status: 'confirmed',
      occurrences: [], createdAt: '7月28日 20:00', acceptedAt: '7月28日 20:30', confirmedAt: '7月28日 20:30', split: true, deducted: false, cancelReason: '', cancelledBy: ''
    },
    /* ---- 上面这张周课表拆出来的每节课 ---- */
    {
      id: 'PL20260728004-01', planId: 'PL20260728004', isOccurrence: true, student: '王子涵', courseId: 'function', courseName: '高中数学', subject: '数学', grade: '高一',
      teacherId: 'zhang', teacherName: '张三老师', date: '2026-07-31', dateLabel: '7月31日', time: '19:00',
      mode: '线下', place: '西安小寨校区', remark: '', content: '三角函数图象与性质复习\n正弦型函数参数 A、ω、φ 的确定\n图象平移与伸缩变换专项训练', feedback: '能准确画出正弦型函数图象，参数求解思路清晰。平移与伸缩的先后顺序偶尔混淆，课上用两组例题对比做了强化。', requirement: '整理两种变换顺序的对比笔记，完成《三角函数图象》专项练习第 6、8 题。', status: 'done',
      lessons: 2, lessonMinutes: 90, durationLabel: '1.5 小时', createdAt: '7月28日 20:30', confirmedAt: '7月28日 20:30', deducted: true, cancelReason: '', cancelledBy: ''
    },
    {
      id: 'PL20260728004-02', planId: 'PL20260728004', isOccurrence: true, student: '王子涵', courseId: 'function', courseName: '高中数学', subject: '数学', grade: '高一',
      teacherId: 'zhang', teacherName: '张三老师', date: '2026-08-07', dateLabel: '8月7日', time: '19:00',
      mode: '线下', place: '西安小寨校区', remark: '', status: 'attended',
      lessons: 2, lessonMinutes: 90, durationLabel: '1.5 小时', createdAt: '7月28日 20:30', confirmedAt: '7月28日 20:30', deducted: true, cancelReason: '', cancelledBy: ''
    },
    {
      id: 'PL20260728004-03', planId: 'PL20260728004', isOccurrence: true, student: '王子涵', courseId: 'function', courseName: '高中数学', subject: '数学', grade: '高一',
      teacherId: 'zhang', teacherName: '张三老师', date: '2026-08-14', dateLabel: '8月14日', time: '19:00',
      mode: '线下', place: '西安小寨校区', remark: '', status: 'confirmed',
      lessons: 2, lessonMinutes: 90, durationLabel: '1.5 小时', createdAt: '7月28日 20:30', confirmedAt: '7月28日 20:30', deducted: false, cancelReason: '', cancelledBy: ''
    },
    {
      id: 'PL20260728004-04', planId: 'PL20260728004', isOccurrence: true, student: '王子涵', courseId: 'function', courseName: '高中数学', subject: '数学', grade: '高一',
      teacherId: 'zhang', teacherName: '张三老师', date: '2026-08-21', dateLabel: '8月21日', time: '19:00',
      mode: '线下', place: '西安小寨校区', remark: '', status: 'confirmed',
      lessons: 2, lessonMinutes: 90, durationLabel: '1.5 小时', createdAt: '7月28日 20:30', confirmedAt: '7月28日 20:30', deducted: false, cancelReason: '', cancelledBy: ''
    },
    /* ===== 单次约课：待确认 ===== */
    {
      id: 'BK20260810005', student: '王子涵', courseId: 'function', courseName: '高中数学', subject: '数学', grade: '高一',
      teacherId: 'zhang', teacherName: '张三老师', date: '2026-08-11', dateLabel: '8月11日', time: '19:00',
      mode: '线下', place: '西安小寨校区', remark: '想巩固函数综合题', status: 'pending',
      lessons: 2, lessonMinutes: 90, durationLabel: '1.5 小时', createdAt: '8月10日 20:15', confirmedAt: '', deducted: false, cancelReason: '', cancelledBy: ''
    },
    {
      id: 'BK20260810006', student: '王子涵', courseId: 'function', courseName: '高中数学', subject: '数学', grade: '高一',
      teacherId: 'zhang', teacherName: '张三老师', date: '2026-08-12', dateLabel: '8月12日', time: '19:00',
      mode: '线下', place: '西安小寨校区', remark: '', status: 'pending',
      lessons: 2, lessonMinutes: 90, durationLabel: '1.5 小时', createdAt: '8月10日 21:02', confirmedAt: '', deducted: false, cancelReason: '', cancelledBy: ''
    },
    /* ===== 单次约课：待上课 ===== */
    {
      id: 'BK20260809007', student: '王子涵', courseId: 'function', courseName: '高中数学', subject: '数学', grade: '高一',
      teacherId: 'zhang', teacherName: '张三老师', date: '2026-08-13', dateLabel: '8月13日', time: '19:00',
      mode: '线上', place: '西安小寨交付中心', remark: '函数单调性需要重点讲解', status: 'confirmed',
      lessons: 2, lessonMinutes: 90, durationLabel: '1.5 小时', createdAt: '8月9日 18:40', confirmedAt: '8月9日 19:05', deducted: false, cancelReason: '', cancelledBy: ''
    },
    {
      id: 'BK20260810008', student: '王子涵', courseId: 'tutorial', courseName: '高中英语', subject: '英语', grade: '高一',
      teacherId: 'zhoumin', teacherName: '周敏老师', date: '2026-08-15', dateLabel: '8月15日', time: '14:00',
      mode: '线上', place: '西安小寨交付中心', remark: '', status: 'confirmed',
      lessons: 2, lessonMinutes: 90, durationLabel: '1.5 小时', createdAt: '8月10日 09:20', confirmedAt: '8月10日 10:00', deducted: false, cancelReason: '', cancelledBy: ''
    },
    /* ===== 单次约课：待评价（已签到待反馈）===== */
    {
      id: 'BK20260808009', student: '王子涵', courseId: 'function', courseName: '高中数学', subject: '数学', grade: '高一',
      teacherId: 'zhang', teacherName: '张三老师', date: '2026-08-08', dateLabel: '8月8日', time: '16:00',
      mode: '线下', place: '西安小寨校区', remark: '', status: 'attended',
      lessons: 2, lessonMinutes: 90, durationLabel: '1.5 小时', createdAt: '8月7日 19:20', confirmedAt: '8月7日 20:02', deducted: true, cancelReason: '', cancelledBy: ''
    },
    {
      id: 'BK20260805010', student: '王子涵', courseId: 'function', courseName: '高中数学', subject: '数学', grade: '高一',
      teacherId: 'liming', teacherName: '李明老师', date: '2026-08-05', dateLabel: '8月5日', time: '18:30',
      mode: '线下', place: '西安小寨校区', remark: '', status: 'attended',
      lessons: 2, lessonMinutes: 90, durationLabel: '1.5 小时', createdAt: '8月4日 19:05', confirmedAt: '8月4日 19:30', deducted: true, cancelReason: '', cancelledBy: ''
    },
    /* ===== 单次约课：已完成 ===== */
    {
      id: 'BK20260803011', student: '王子涵', courseId: 'function', courseName: '高中数学', subject: '数学', grade: '高一',
      teacherId: 'zhang', teacherName: '张三老师', date: '2026-08-03', dateLabel: '8月3日', time: '14:00',
      mode: '线上', place: '西安小寨交付中心', remark: '', content: '函数奇偶性与单调性综合判断\n含参函数单调区间的分类讨论\n函数性质在高考真题中的应用', feedback: '奇偶性判断掌握扎实，含参分类讨论时容易遗漏参数为零的情况，已现场订正并强化“先定定义域、再判单调性”的解题顺序。', requirement: '完成《函数性质综合》练习第 3、5、7 题，重点标注分类讨论的分界点。', status: 'done',
      lessons: 2, lessonMinutes: 90, durationLabel: '1.5 小时', createdAt: '8月2日 20:10', confirmedAt: '8月2日 20:40', deducted: true, cancelReason: '', cancelledBy: ''
    },
    {
      id: 'BK20260729012', student: '王子涵', courseId: 'function', courseName: '高中数学', subject: '数学', grade: '高一',
      teacherId: 'liming', teacherName: '李明老师', date: '2026-07-29', dateLabel: '7月29日', time: '19:00',
      mode: '线下', place: '西安小寨校区', remark: '', content: '数列通项公式的常见求法\n等差、等比数列综合应用\n错位相减求和法', feedback: '数列基础公式掌握良好，错位相减的运算步骤需要再梳理，课上已带完整推导一遍。', requirement: '完成错位相减专项练习第 1、2 题，整理求和步骤模板。', status: 'done',
      lessons: 2, lessonMinutes: 90, durationLabel: '1.5 小时', createdAt: '7月28日 19:05', confirmedAt: '7月28日 19:30', deducted: true, cancelReason: '', cancelledBy: ''
    },
    {
      id: 'BK20260725016', student: '王子涵', courseId: 'function', courseName: '高中数学', subject: '数学', grade: '高一',
      teacherId: 'zhang', teacherName: '张三老师', date: '2026-07-25', dateLabel: '7月25日', time: '16:00',
      mode: '线下', place: '西安小寨校区', remark: '', content: '函数定义域与值域的求法梳理\n复合函数定义域的应用\n换元法求值域专项训练', feedback: '课堂状态专注，定义域求法已能独立完成；换元法求值域的端点取舍还不够熟练。', requirement: '重做课堂例题 2、4，完成练习册 P12 第 1-3 题。', status: 'done',
      lessons: 2, lessonMinutes: 90, durationLabel: '1.5 小时', createdAt: '7月24日 20:10', confirmedAt: '7月24日 20:30', deducted: true, cancelReason: '', cancelledBy: ''
    },
    /* ===== 单次约课：已取消 ===== */
    {
      id: 'BK20260809013', student: '王子涵', courseId: 'sequence', courseName: '高中语文', subject: '语文', grade: '高一',
      teacherId: 'liuwen', teacherName: '刘文老师', date: '2026-08-09', dateLabel: '8月9日', time: '10:30',
      mode: '线上', place: '西安小寨交付中心', remark: '临时调整出行安排', status: 'cancelled',
      lessons: 2, lessonMinutes: 90, durationLabel: '1.5 小时', createdAt: '8月6日 09:20', confirmedAt: '', deducted: false, cancelReason: '时间冲突', cancelledBy: 'parent'
    },
    {
      id: 'BK20260806014', student: '王子涵', courseId: 'tutorial', courseName: '高中英语', subject: '英语', grade: '高一',
      teacherId: 'zhang', teacherName: '张三老师', date: '2026-08-06', dateLabel: '8月6日', time: '19:00',
      mode: '上门', place: '上门', remark: '', status: 'cancelled',
      lessons: 2, lessonMinutes: 90, durationLabel: '1.5 小时', createdAt: '8月5日 21:10', confirmedAt: '8月5日 21:35', deducted: false, cancelReason: '老师临时有事', cancelledBy: 'teacher'
    },
    {
      id: 'BK20260804015', student: '王子涵', courseId: 'function', courseName: '高中数学', subject: '数学', grade: '高一',
      teacherId: 'wangjing', teacherName: '王静老师', date: '2026-08-04', dateLabel: '8月4日', time: '15:30',
      mode: '线下', place: '西安小寨校区', remark: '', status: 'cancelled',
      lessons: 2, lessonMinutes: 90, durationLabel: '1.5 小时', createdAt: '8月3日 20:40', confirmedAt: '', deducted: false, cancelReason: '家长临时有事', cancelledBy: 'parent'
    }
  ];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function read() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var state = JSON.parse(raw);
        if (state && state.bookings && state.bookings.length !== undefined) {
          return { bookings: state.bookings, availability: state.availability || {}, special: state.special || {}, specialEnabled: state.specialEnabled || {} };
        }
      }
    } catch (error) { /* 忽略读取异常，使用种子数据 */ }
    return { bookings: clone(SEED), availability: {}, special: {}, specialEnabled: {} };
  }

  function writeState(state) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ bookings: state.bookings || [], availability: state.availability || {}, special: state.special || {}, specialEnabled: state.specialEnabled || {} }));
    } catch (error) { /* 演示环境忽略写入异常 */ }
  }

  function saveAll(bookings) {
    var state = read();
    state.bookings = bookings;
    writeState(state);
  }

  function list() { return read().bookings; }

  function byId(id) {
    var found = null;
    list().forEach(function (item) { if (item.id === id) found = item; });
    return found;
  }

  function update(id, patch) {
    var bookings = list();
    bookings.forEach(function (item) {
      if (item.id !== id) return;
      Object.keys(patch).forEach(function (key) { item[key] = patch[key]; });
    });
    saveAll(bookings);
    return byId(id);
  }

  function add(booking) {
    var bookings = list();
    bookings.unshift(booking);
    saveAll(bookings);
    return booking;
  }

  function remove(id) {
    saveAll(list().filter(function (item) { return item.id !== id; }));
  }

  // 教师确认排课：冻结课时
  function confirm(id) { return update(id, { status: 'confirmed', confirmedAt: nowLabel() }); }

  // 教师拒绝：解冻并记录原因
  function reject(id, reason) { return update(id, { status: 'cancelled', cancelledBy: 'teacher', cancelReason: reason || '时间冲突' }); }

  // 家长改约：取消后重新发起约课

  // 家长取消约课
  function cancel(id, reason) { return update(id, { status: 'cancelled', cancelledBy: 'parent', cancelReason: reason || '家长取消约课' }); }

  // 第三方签到回调成功：真正扣减课时
  function checkin(id) { return update(id, { status: 'attended', deducted: true }); }

  // 教师提交课后反馈
  function markDone(id, detail) {
    detail = detail || {};
    var patch = { status: 'done' };
    if (detail.content !== undefined) patch.content = detail.content;
    if (detail.feedback !== undefined) patch.feedback = detail.feedback;
    var requirement = detail.requirement !== undefined ? detail.requirement : detail.homework;
    if (requirement !== undefined) patch.requirement = requirement;
    return update(id, patch);
  }

  // 家长提交课程评价：评价是完成后的附加信息，不改变教学完成状态
  function markReviewed(id, review) {
    review = review || {};
    return update(id, {
      reviewedAt: nowLabel(),
      courseScore: Number(review.courseScore) || 0,
      teacherScore: Number(review.teacherScore) || 0,
      review: review.text || ''
    });
  }

  // 按“科目 + 年级”匹配可以上这门课的老师
  function teachersFor(courseId) {
    var course = courses().filter(function (item) { return item.id === courseId; })[0];
    if (!course) return [];
    return TEACHERS.filter(function (teacher) {
      return teacher.subjects.indexOf(course.subject) > -1 && teacher.grades.indexOf(course.grade) > -1;
    });
  }

  function courses() { return clone(COURSES); }

  function days() { return clone(DAYS); }

  function times() { return TIMES.slice(); }

  function teacher(id) {
    var found = null;
    TEACHERS.forEach(function (item) { if (item.id === id) found = item; });
    return found;
  }

  function placeOf(mode) { return MODE_PLACE[mode] || '西安小寨校区'; }

  // 第一版可约时段：四类时间做长期默认，特殊日期只覆盖某一天。
  // 时间轴统一为 08:00 — 23:30、30 分钟一档：白天 08:00 - 17:30，晚上 18:00 - 23:30
  var DAY_START = 8 * 60, DAY_END = 17 * 60 + 30, NIGHT_START = 18 * 60, NIGHT_END = 23 * 60 + 30;
  function minutesOf(time) { var parts = String(time).split(':'); return Number(parts[0]) * 60 + Number(parts[1]); }
  function timesIn(from, to) { return TIMES.filter(function (time) { var m = minutesOf(time); return m >= from && m <= to; }); }
  var DAY_TIMES = timesIn(DAY_START, DAY_END);
  var NIGHT_TIMES = timesIn(NIGHT_START, NIGHT_END);
  var TIME_RANGES = [
    { id: 'workday-day', label: '工作日白天', note: '周一至周五 · 08:00 - 17:30', times: DAY_TIMES.slice() },
    { id: 'workday-evening', label: '工作日晚上', note: '周一至周五 · 18:00 - 23:30', times: NIGHT_TIMES.slice() },
    { id: 'weekend-day', label: '周末白天', note: '周六、周日 · 08:00 - 17:30', times: DAY_TIMES.slice() },
    { id: 'weekend-evening', label: '周末晚上', note: '周六、周日 · 18:00 - 23:30', times: NIGHT_TIMES.slice() }
  ];

  var DEFAULT_AVAILABILITY = {
    zhang: ['workday-day', 'workday-evening', 'weekend-day', 'weekend-evening'],
    liming: ['workday-evening', 'weekend-day', 'weekend-evening'],
    wangjing: ['workday-day', 'weekend-day'],
    zhaolei: ['workday-evening', 'weekend-evening'],
    chenyu: ['workday-day', 'weekend-day']
  };

  // 演示用特殊日期：8月19日只开放 09:00 / 14:00，8月22日当天不上课
  var DEFAULT_SPECIAL = {
    zhang: { '2026-08-19': ['09:00', '14:00'], '2026-08-22': [] }
  };

  function timeRange(id) {
    var found = null;
    TIME_RANGES.forEach(function (item) { if (item.id === id) found = item; });
    return found;
  }

  function timeRanges() { return clone(TIME_RANGES); }

  function availabilityIds(teacherId, store) {
    var source = store === undefined ? read().availability : store;
    if (source && Object.prototype.hasOwnProperty.call(source, teacherId)) {
      return (source[teacherId] || []).filter(function (id) { return !!timeRange(id); });
    }
    return (DEFAULT_AVAILABILITY[teacherId] || []).slice();
  }

  function availability(teacherId) {
    var selected = availabilityIds(teacherId);
    return TIME_RANGES.map(function (item) {
      return { id: item.id, label: item.label, note: item.note, times: item.times.slice(), open: selected.indexOf(item.id) > -1 };
    });
  }

  function setAvailability(teacherId, rangeId, open) {
    if (!timeRange(rangeId)) return false;
    var state = read();
    state.availability = state.availability || {};
    var selected = availabilityIds(teacherId, state.availability);
    var index = selected.indexOf(rangeId);
    if (open && index === -1) selected.push(rangeId);
    if (!open && index > -1) selected.splice(index, 1);
    state.availability[teacherId] = TIME_RANGES.map(function (item) { return item.id; }).filter(function (id) { return selected.indexOf(id) > -1; });
    writeState(state);
    return true;
  }

  function resetAvailability(teacherId) {
    var state = read();
    state.availability = state.availability || {};
    delete state.availability[teacherId];
    writeState(state);
  }

  // 日期基础信息：优先取可约窗口内的日期，窗口外按自然日推算
  function dayInfo(date) {
    var found = null;
    DAYS.forEach(function (day) { if (day.date === date) found = day; });
    if (found) return found;
    var parsed = parseKey(date);
    return {
      date: date,
      label: (parsed.getMonth() + 1) + '月' + parsed.getDate() + '日',
      week: WEEK_TEXT[(parsed.getDay() + 6) % 7],
      weekday: (parsed.getDay() + 6) % 7
    };
  }

  function weekdayLabel(weekday) {
    return WEEK_TEXT[Number(weekday)] || '';
  }

  function scheduleLabel(slots) {
    return (slots || []).map(function (slot) {
      return '每' + weekdayLabel(slot.weekday) + ' ' + slot.time;
    }).join(' · ');
  }

  function planStats(startDate, endDate, slots) {
    var start = parseKey(startDate), end = parseKey(endDate), sessions = 0;
    if (!startDate || !endDate || start > end) return { sessions: 0, lessons: 0 };
    for (var current = new Date(start.getTime()); current <= end; current.setDate(current.getDate() + 1)) {
      var weekday = (current.getDay() + 6) % 7;
      (slots || []).forEach(function (slot) {
        if (Number(slot.weekday) === weekday) sessions += 1;
      });
    }
    return { sessions: sessions, lessons: sessions * DEFAULT_CLASS_LESSONS };
  }

  function buildOccurrences(startDate, endDate, slots, planId) {
    var start = parseKey(startDate), end = parseKey(endDate), list = [];
    if (!startDate || !endDate || start > end) return list;
    for (var current = new Date(start.getTime()); current <= end; current.setDate(current.getDate() + 1)) {
      var weekday = (current.getDay() + 6) % 7;
      (slots || []).forEach(function (slot) {
        if (Number(slot.weekday) !== weekday) return;
        list.push({
          id: planId + '-S' + String(list.length + 1).padStart(3, '0'),
          date: keyOf(current),
          dateLabel: (current.getMonth() + 1) + '月' + current.getDate() + '日',
          weekday: weekday,
          time: slot.time,
          status: 'confirmed',
          deducted: false
        });
      });
    }
    return list;
  }

  function acceptPlan(id, teacherId) {
    var item = byId(id), teacherInfo = teacher(teacherId);
    if (!item || !item.isPlan || item.status !== 'pending' || item.teacherAccepted || !teacherInfo) return null;
    if (item.orderMode === 'designated' && item.teacherId && item.teacherId !== teacherId) return null;
    var accepted = update(id, {
      teacherId: teacherInfo.id,
      teacherName: teacherInfo.name,
      teacherAccepted: true,
      acceptedAt: nowLabel()
    });
    // 指定老师：老师确认即生效，直接生成每节课（不须家长二次确认）
    if (item.orderMode === 'designated') return activatePlan(id);
    return accepted;
  }

  function activatePlan(id) {
    var item = byId(id);
    if (!item || !item.isPlan || !item.teacherAccepted || item.status !== 'pending') return null;
    var stats = planStats(item.startDate, item.endDate, item.weeklySlots);
    var occurrences = buildOccurrences(item.startDate, item.endDate, item.weeklySlots, item.id);
    var bookings = list();
    bookings.forEach(function (booking) {
      if (booking.id !== id) return;
      booking.status = 'confirmed';
      booking.teacherAccepted = true;
      booking.split = true;
      booking.confirmedAt = nowLabel();
      booking.sessionCount = stats.sessions;
      booking.lessons = stats.lessons;
      booking.occurrences = occurrences;
    });
    var children = occurrences.map(function (occurrence) {
      return {
        id: occurrence.id,
        planId: item.id,
        isOccurrence: true,
        student: item.student,
        courseId: item.courseId,
        courseName: item.courseName,
        subject: item.subject,
        grade: item.grade,
        teacherId: item.teacherId,
        teacherName: item.teacherName,
        date: occurrence.date,
        dateLabel: occurrence.dateLabel,
        time: occurrence.time,
        mode: item.mode,
        place: item.place,
        remark: item.remark || '',
        status: 'confirmed',
        lessons: DEFAULT_CLASS_LESSONS,
        lessonMinutes: DEFAULT_CLASS_MINUTES,
        durationLabel: item.durationLabel || '1.5 小时',
        createdAt: item.createdAt || nowLabel(),
        confirmedAt: nowLabel(),
        deducted: false,
        cancelReason: '',
        cancelledBy: ''
      };
    });
    saveAll(children.concat(bookings));
    return byId(id);
  }

  function confirmPlan(id) { return activatePlan(id); }

  // 特殊日期：只覆盖某一天，未设置时跟随四类时间
  function specialOf(teacherId, store) {
    var source = store === undefined ? read().special : store;
    var own = source && Object.prototype.hasOwnProperty.call(source, teacherId) ? source[teacherId] : DEFAULT_SPECIAL[teacherId];
    return own ? clone(own) : {};
  }

  function specialDates(teacherId) {
    var store = specialOf(teacherId);
    return Object.keys(store).sort().map(function (date) {
      var info = dayInfo(date);
      return { date: date, label: info.label, week: info.week, times: (store[date] || []).slice().sort() };
    });
  }

  function setSpecialDate(teacherId, date, times) {
    if (!date || !dayInfo(date)) return false;
    var state = read();
    state.special = state.special || {};
    var own = state.special[teacherId] || specialOf(teacherId, state.special);
    own[date] = (times || []).filter(function (time) { return TIMES.indexOf(time) > -1; }).sort();
    state.special[teacherId] = own;
    writeState(state);
    return true;
  }

  function clearSpecialDate(teacherId, date) {
    var state = read();
    var own = specialOf(teacherId, state.special);
    if (!Object.prototype.hasOwnProperty.call(own, date)) return false;
    delete own[date];
    state.special = state.special || {};
    state.special[teacherId] = own;
    writeState(state);
    return true;
  }

  // 特殊日期总开关：关闭后所有特殊日期不生效（数据仍保留），家长端只按四类时间展示
  function specialEnabled(teacherId) {
    var map = read().specialEnabled || {};
    return Object.prototype.hasOwnProperty.call(map, teacherId) ? !!map[teacherId] : true;
  }

  function setSpecialEnabled(teacherId, enabled) {
    var state = read();
    state.specialEnabled = state.specialEnabled || {};
    state.specialEnabled[teacherId] = !!enabled;
    writeState(state);
    return !!enabled;
  }

  // 四类时间的默认时刻（未命中特殊日期时使用）
  function defaultTimes(teacherId, date) {
    var ids = availabilityIds(teacherId);
    var weekend = dayInfo(date).weekday > 4;
    var times = [];
    TIME_RANGES.forEach(function (range) {
      if (ids.indexOf(range.id) === -1) return;
      if ((range.id.indexOf('weekend') === 0) !== weekend) return;
      range.times.forEach(function (time) { if (times.indexOf(time) === -1) times.push(time); });
    });
    return times;
  }

  // 某位老师某天的可上课时间：特殊日期优先，其次按四类时间的默认规则
  function dayTimes(teacherId, date) {
    if (!specialEnabled(teacherId)) return defaultTimes(teacherId, date);
    var store = specialOf(teacherId);
    if (Object.prototype.hasOwnProperty.call(store, date)) return (store[date] || []).slice();
    return defaultTimes(teacherId, date);
  }

  function isBusy(teacherId, date, time) {
    if (BUSY[teacherId + '|' + date + '|' + time]) return true;
    return list().some(function (item) {
      return item.teacherId === teacherId && item.date === date && item.time === time && (item.status === 'pending' || item.status === 'confirmed');
    });
  }

  function freeTimes(teacherId, date) {
    return dayTimes(teacherId, date).filter(function (time) { return !isBusy(teacherId, date, time); });
  }

  /* 与 isBusy 同口径，但忽略指定课次自身（请假调课时不能把自己算成占用） */
  function isBusyExcept(teacherId, date, time, exceptId) {
    if (BUSY[teacherId + '|' + date + '|' + time]) return true;
    return list().some(function (item) {
      return item.id !== exceptId && item.teacherId === teacherId && item.date === date && item.time === time && (item.status === 'pending' || item.status === 'confirmed');
    });
  }

  // ===== 请假（待上课课次的改期 / 取消申请，须另一方确认） =====
  var LEAVE_MIN_HOURS = 2;            // 开课前 2 小时内不允许发起请假
  var LEAVE_DEMO_HOUR = 9;            // 原型演示“当前时刻”＝演示今天 09:00（避免演示数据全部过期，无法演示请假）

  function demoNow() {
    var base = parseKey(DEMO_TODAY);
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), LEAVE_DEMO_HOUR, 0, 0);
  }

  function sessionStart(item) {
    if (!item || !item.date) return null;
    var base = parseKey(item.date);
    var parts = String(item.time || '00:00').split(':');
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), Number(parts[0]) || 0, Number(parts[1]) || 0, 0);
  }

  // 距开课还有多少小时（负数表示已开课）
  function leaveHoursLeft(item) {
    var start = sessionStart(item);
    return start ? (start.getTime() - demoNow().getTime()) / 3600000 : 0;
  }

  function labelOfDate(key) {
    var date = parseKey(key);
    return (date.getMonth() + 1) + '月' + date.getDate() + '日';
  }

  // 请假调课可选日期：老师未来 4 周已开放且未被占用的时段（排除本次课自身）
  function leaveDays(item) {
    if (!item || !item.teacherId) return [];
    var rows = [];
    DAYS.forEach(function (day) {
      var own = item.date === day.date ? item.time : '';
      var times = dayTimes(item.teacherId, day.date).filter(function (time) {
        if (time === own) return false;                       // 不含本次课自身占用的时段
        return !isBusyExcept(item.teacherId, day.date, time, item.id);
      });
      if (!times.length) return;
      rows.push({ date: day.date, label: day.label, week: day.week, times: times });
    });
    return rows;
  }

  function canRequestLeave(id) {
    var item = byId(id);
    if (!item) return { ok: false, reason: '课次不存在' };
    if (item.status !== 'confirmed') return { ok: false, reason: '只有待上课的课次可以请假' };
    if (item.leave && item.leave.status === 'pending') return { ok: false, reason: '已有一条待对方确认的请假' };
    if (leaveHoursLeft(item) < LEAVE_MIN_HOURS) return { ok: false, reason: '距开课不足 ' + LEAVE_MIN_HOURS + ' 小时，无法发起请假' };
    return { ok: true, reason: '' };
  }

  // 发起请假：type=reschedule 须带新日期/时段；type=cancel 直接取消本次排课
  function requestLeave(id, payload) {
    var check = canRequestLeave(id);
    if (!check.ok) return check;
    var item = byId(id);
    var data = payload || {};
    var type = data.type === 'cancel' ? 'cancel' : 'reschedule';
    var reason = String(data.reason || '').trim();
    if (!reason) return { ok: false, reason: '请选择请假原因' };
    if (type === 'reschedule') {
      if (!data.newDate || !data.newTime) return { ok: false, reason: '请选择调整后的上课时间' };
      if (dayTimes(item.teacherId, data.newDate).indexOf(data.newTime) === -1) return { ok: false, reason: '新时间不在老师开放的时段内' };
      if (data.newDate === item.date && data.newTime === item.time) return { ok: false, reason: '新时间与原时间相同，请重新选择' };
      if (isBusyExcept(item.teacherId, data.newDate, data.newTime, item.id)) return { ok: false, reason: '新时间已被占用，请另选时段' };
    }
    var leave = {
      by: data.by === 'teacher' ? 'teacher' : 'parent',
      type: type,
      reason: reason,
      note: String(data.note || '').trim(),
      newDate: type === 'reschedule' ? data.newDate : '',
      newTime: type === 'reschedule' ? data.newTime : '',
      status: 'pending',
      requestedAt: nowLabel(),
      decidedAt: '',
      decidedBy: '',
      decision: ''
    };
    update(id, { leave: leave });
    return { ok: true, leave: leave };
  }

  // 发起方在对方响应前撤回
  function withdrawLeave(id) {
    var item = byId(id);
    if (!item || !item.leave || item.leave.status !== 'pending') return { ok: false, reason: '当前没有待确认的请假' };
    var leave = item.leave;
    leave.status = 'withdrawn';
    leave.decidedAt = nowLabel();
    leave.decidedBy = leave.by;
    leave.decision = 'withdraw';
    update(id, { leave: leave });
    return { ok: true, leave: leave };
  }

  // 对方响应：reschedule=按新时间确认改期（课时继续冻结）；cancel=直接取消本次排课（归还冻结课时）
  function respondLeave(id, decision) {
    var item = byId(id);
    if (!item || !item.leave || item.leave.status !== 'pending') return { ok: false, reason: '当前没有待确认的请假' };
    var leave = item.leave;
    leave.decidedAt = nowLabel();
    leave.decidedBy = leave.by === 'parent' ? 'teacher' : 'parent';
    if (decision === 'reschedule') {
      if (leave.type !== 'reschedule') return { ok: false, reason: '本次请假没有提出新的时间' };
      if (isBusyExcept(item.teacherId, leave.newDate, leave.newTime, item.id)) return { ok: false, reason: '新时间已被占用，请直接取消或重新协商' };
      leave.status = 'approved';
      leave.decision = 'reschedule';
      update(id, { date: leave.newDate, dateLabel: labelOfDate(leave.newDate), time: leave.newTime, leave: leave });
      return { ok: true, leave: leave, moved: true };
    }
    leave.status = 'cancelled';
    leave.decision = 'cancel';
    update(id, { status: 'cancelled', cancelledBy: leave.by, cancelReason: '请假 · ' + leave.reason, leave: leave });
    return { ok: true, leave: leave, cancelled: true };
  }

  // 家长端：按老师统计未来 4 周每天的可约时段数
  function teacherDayOptions(teacherId) {
    return DAYS.map(function (day) {
      return { date: day.date, label: day.label, week: day.week, weekday: day.weekday, count: freeTimes(teacherId, day.date).length };
    });
  }

  // 家长端：某位老师某天的 5 个固定时刻状态（可约 / 已被约 / 未开放）
  function teacherSlotOptions(teacherId, date) {
    return TIMES.map(function (time) {
      var open = dayTimes(teacherId, date).indexOf(time) > -1;
      var busy = open && isBusy(teacherId, date, time);
      return { time: time, state: open ? (busy ? 'booked' : 'open') : 'closed' };
    });
  }

  // 老师当前开放的四类时间（家长端展示“空闲时间段”）
  function teacherOpenRanges(teacherId) {
    return availability(teacherId).filter(function (item) { return item.open; }).map(function (item) { return item.label; });
  }

  // 可约时间概览：工作日全天 / 周末全天 / 全部时间（教师端与家长端统一展示口径）
  function availabilityLabel(teacherId) {
    var selected = availabilityIds(teacherId);
    if (!selected.length) return '暂未开放';
    function has(id) { return selected.indexOf(id) > -1; }
    var workdayAll = has('workday-day') && has('workday-evening');
    var weekendAll = has('weekend-day') && has('weekend-evening');
    if (workdayAll && weekendAll) return '全部时间';
    var parts = [];
    if (workdayAll) parts.push('工作日全天');
    else {
      if (has('workday-day')) parts.push('工作日白天');
      if (has('workday-evening')) parts.push('工作日晚上');
    }
    if (weekendAll) parts.push('周末全天');
    else {
      if (has('weekend-day')) parts.push('周末白天');
      if (has('weekend-evening')) parts.push('周末晚上');
    }
    return parts.join('、');
  }

  // 老师未来 4 周可约时段总数（推荐卡与候选列表用）
  function teacherFreeCount(teacherId) {
    return DAYS.reduce(function (sum, day) { return sum + freeTimes(teacherId, day.date).length; }, 0);
  }

  // 老师推荐：优先“以前给该学员上过这门课”的老师；首次约课按评分、授课量自动匹配
  function recommendTeacher(student, courseId) {
    var candidates = teachersFor(courseId).slice().sort(function (a, b) { return (b.score - a.score) || (b.lessons - a.lessons); });
    if (!candidates.length) return null;
    var candidateIds = candidates.map(function (item) { return item.id; });
    var records = list().filter(function (item) {
      return item.student === student && item.courseId === courseId && item.teacherId && item.status !== 'cancelled' && candidateIds.indexOf(item.teacherId) > -1;
    });
    if (records.length) {
      records.sort(function (a, b) { return String(b.date + ' ' + b.time).localeCompare(String(a.date + ' ' + a.time)); });
      var teacherId = records[0].teacherId;
      return {
        teacherId: teacherId,
        reason: 'history',
        count: records.filter(function (item) { return item.teacherId === teacherId; }).length
      };
    }
    return { teacherId: candidates[0].id, reason: 'auto', count: 0 };
  }

  // 批量预约：单次 / 每周（连约 4 次）/ 每天（连约 7 天）；逐节校验老师是否开放且未被约
  function batchSessions(params) {
    var totals = { once: 1, weekly: 4, daily: 7 };
    var mode = params.mode || 'once';
    var total = totals[mode] || 1;
    var step = mode === 'weekly' ? 7 : 1;
    var base = parseKey(params.date);
    var sessions = [];
    for (var index = 0; index < total; index += 1) {
      var current = new Date(base.getFullYear(), base.getMonth(), base.getDate() + step * index);
      var date = keyOf(current);
      var info = dayInfo(date);
      var open = dayTimes(params.teacherId, date).indexOf(params.time) > -1;
      var busy = open && isBusy(params.teacherId, date, params.time);
      sessions.push({ date: date, label: info.label, week: info.week, time: params.time, ok: open && !busy, state: open ? (busy ? 'booked' : 'open') : 'closed' });
    }
    return sessions;
  }

  // 教师端统计：已开放的四类时间数 / 特殊日期数 / 已有约课数
  function openCount(teacherId) { return availabilityIds(teacherId).length; }
  function specialCount(teacherId) { return specialDates(teacherId).length; }
  function bookedCount(teacherId) {
    return list().filter(function (item) {
      return item.teacherId === teacherId && (item.status === 'pending' || item.status === 'confirmed');
    }).length;
  }

  // 单条约课占用的课时数：新数据按 lessons 计算，历史演示数据兼容为 1 课时
  function lessonsOf(item) {
    var value = item && Number(item.lessons);
    return value > 0 ? value : LEGACY_LESSONS_PER_BOOKING;
  }

  // 课时统计：已购 / 已上 / 冻结 / 可用
  function hours() {
    var bookings = list();
    var frozen = 0, deducted = 0;
    bookings.forEach(function (item) {
      var lessons = lessonsOf(item);
      if (item.status === 'confirmed' && !item.split) frozen += lessons;
      if (item.deducted) deducted += lessons;
    });
    var used = BASE_USED_HOURS + deducted;
    return {
      purchased: PURCHASED_HOURS,
      used: used,
      frozen: frozen,
      available: Math.max(0, PURCHASED_HOURS - used - frozen),
      perLesson: MINUTES_PER_LESSON,
      classMinutes: DEFAULT_CLASS_MINUTES,
      classLessons: DEFAULT_CLASS_LESSONS,
      lessonsOf: lessonsOf
    };
  }

  function countByStatus(status, teacherId) {
    return list().filter(function (item) {
      if (item.split) return false;
      if (item.status !== status) return false;
      return teacherId ? item.teacherId === teacherId : true;
    }).length;
  }

  // 教师端：某位老师的约课列表
  function forTeacher(teacherId, statusList) {
    return list().filter(function (item) {
      if (item.split) return false;
      if (item.teacherId !== teacherId) return false;
      return statusList && statusList.length ? statusList.indexOf(item.status) > -1 : true;
    });
  }

  function nowLabel() {
    var date = new Date();
    function pad(value) { return String(value).padStart(2, '0'); }
    return (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  var idSeq = Math.floor(Math.random() * 900) + 100;
  function makeId() {
    var now = new Date();
    var stamp = String(now.getFullYear()) + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
    idSeq = idSeq % 999 + 1;   // 批量提交时保证同一页面会话内不重复
    return 'BK' + stamp + String(idSeq).padStart(3, '0');
  }

  window.YZB = {
    PURCHASED_HOURS: PURCHASED_HOURS,
    BASE_USED_HOURS: BASE_USED_HOURS,
    list: list,
    byId: byId,
    add: add,
    update: update,
    remove: remove,
    confirm: confirm,
    reject: reject,
    cancel: cancel,
    checkin: checkin,
    leave: {
      canRequest: canRequestLeave,
      request: requestLeave,
      respond: respondLeave,
      withdraw: withdrawLeave,
      days: leaveDays,
      hoursLeft: leaveHoursLeft,
      labelOfDate: labelOfDate,
      minHours: LEAVE_MIN_HOURS
    },
    markDone: markDone,
    markReviewed: markReviewed,
    teachersFor: teachersFor,
    courses: courses,
    days: days,
    times: times,
    teacher: teacher,
    placeOf: placeOf,
    timeRange: timeRange,
    timeRanges: timeRanges,
    availability: availability,
    setAvailability: setAvailability,
    resetAvailability: resetAvailability,
    specialDates: specialDates,
    setSpecialDate: setSpecialDate,
    clearSpecialDate: clearSpecialDate,
    specialEnabled: specialEnabled,
    setSpecialEnabled: setSpecialEnabled,
    dayInfo: dayInfo,
    dayTimes: dayTimes,
    freeTimes: freeTimes,
    teacherDayOptions: teacherDayOptions,
    teacherSlotOptions: teacherSlotOptions,
    teacherOpenRanges: teacherOpenRanges,
    availabilityLabel: availabilityLabel,
    teacherFreeCount: teacherFreeCount,
    recommendTeacher: recommendTeacher,
    batchSessions: batchSessions,
    openCount: openCount,
    specialCount: specialCount,
    bookedCount: bookedCount,
    MINUTES_PER_LESSON: MINUTES_PER_LESSON,
    DEFAULT_CLASS_MINUTES: DEFAULT_CLASS_MINUTES,
    DEFAULT_CLASS_LESSONS: DEFAULT_CLASS_LESSONS,
    lessonsOf: lessonsOf,
    hours: hours,
    countByStatus: countByStatus,
    forTeacher: forTeacher,
    scheduleLabel: scheduleLabel,
    planStats: planStats,
    buildOccurrences: buildOccurrences,
    acceptPlan: acceptPlan,
    confirmPlan: confirmPlan,
    nowLabel: nowLabel,
    makeId: makeId
  };
})();
