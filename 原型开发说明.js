(function () {
  'use strict';
  var file = decodeURIComponent(location.pathname.split('/').pop() || '');
  var title = document.title.replace(/\s+v\d+(?:\.\d+)?$/, '').replace(/\s*[—-]\s*优坐标管理系统.*$/, '').replace(/^(教师端|家长端)\s*[·•]\s*/, '').trim();
  var page = title || file.replace(/_页面还原\.html$/, '');
  var common = {
    '上课记录': ['家长端课程记录与待办归集','按状态、月份、课程和授课方式查看上课记录，并从待评价记录进入评价流程。','筛选规则|状态与操作|重点测试','多条件共同筛选，结果数量与累计课时同步。;待评价按钮位于课程基础信息区右侧；已评价仅查看历史。;组合筛选、空状态、评价入口和返回状态恢复。'],
    '业务中心': ['合伙人业务工作台','集中展示课时、课程销售和常用业务入口。','信息结构|交互规则|重点测试','只展示当前账号有权限的业务指标，没有内容的字段不展示。;数据卡片进入明细，业务入口进入办理流程。;身份权限、空数据、入口跳转和返回状态。'],
    '个人中心': ['统一身份与服务入口','聚合身份、教师端/家长端、创客中心、推广中心和个人设置。','身份展示|入口规则|重点测试','只展示账号真实拥有的身份和服务入口。;授课中心面向教师，学习中心面向家长，推广中心进入素材广场。;多身份组合、各入口和退出登录确认。'],
    '个人资料': ['用户基础资料维护','查看和编辑头像、姓名、联系方式等基础资料。','字段规则|保存规则|重点测试','必填项未完成不可提交；无内容的非必填字段不展示。;保存后更新查看态，取消不保存，敏感信息脱敏。;必填、格式、保存、取消和重复提交。'],
    '优AI甄选体验课': ['体验课分类与选购','按课程分类浏览体验课，并进入详情或购买流程。','分类与列表|操作规则|重点测试','切换分类只展示对应课程，选中态唯一。;抢购进入购买确认，查看进入详情，不可售时隐藏购买按钮。;分类、售罄/下架状态和购买链路返回。'],
    '创客中心': ['团队、收益与客户跟进','查看团队、累计收益和可提现金额，处理客户跟进、转移和回访。','团队与收益|客户操作|重点测试','累计收益和申请提现区域必须保留，提现后刷新余额。;共享池仅有权限用户可“转移跟进”，回访写入跟进记录。;权限、手机号查询、确认取消和提现边界。'],
    '学习中心': ['家长端学习工作台','汇总学员资料、上课记录、课程计划和剩余课时。','课程计划|入口规则|重点测试','切换月份刷新日历，点击有课日期刷新当日计划。;课程进入详情，待评价在基础信息区右侧显示“去评价”。;月份边界、无课日期、跳转和剩余课时。'],
    '学员资料': ['学员档案编辑与审核','家长维护孩子基本信息和学习资料，修改后提交审核。','字段规则|审核规则|重点测试','必填完成后才可提交，无内容的选填字段不展示。;驳回时展示原因，点击编辑后修改并重新提交。;校验、驳回、审核中和重新提交。'],
    '家长沟通群': ['课程相关家校沟通','教师与家长围绕课程反馈、作业和学习情况沟通。','消息规则|操作规则|重点测试','消息按时间排序并区分本人，发送后追加到底部。;空消息不可发送，原型发送不代表真实送达。;输入发送、滚动定位、长文本和返回详情。'],
    '招募大厅': ['教师端招募业务预留','后续承载招募活动、任务、教师报名和进度查询。','建议结构|入口规则|待确认','活动展示对象、条件、截止时间和状态，报名后展示审核进度。;从授课中心进入并返回授课中心。;招募主体、报名资料、审核角色和推广素材联动。'],
    '授课中心': ['教师端授课工作台','展示资料状态、工作入口、教学数据、排课日历和已排课程。','资料状态|工作入口|授课地点|重点测试','此页仅显示“已驳回”；原因在教员资料查看，点击编辑资料后修改。;招募大厅和授课管理位于教师信息与数据统计之间；日期切换课程。;线上：西安小寨交付中心；线下：西安小寨校区；上门：上门。;模拟驳回、资料跳转、月份和无课日期。'],
    '授课管理': ['教师授课能力与设置预留','后续维护可授课程、时间、授课方式或接单设置。','建议范围|入口规则|待确认','维护年级、科目、教材、方式和时间段，设置影响匹配与排课。;从授课中心进入并返回授课中心。;停课权限、接单范围和变更审核规则。'],
    '授课记录': ['教师端授课历史与待办','按状态、月份和授课方式查看记录，并处理待反馈课程。','筛选规则|状态与操作|重点测试','多条件共同筛选，累计授课仅统计已完成课程。;待上课看详情，待反馈填反馈；卡片与家长端统一紧凑。;组合筛选、空状态、反馈和状态回写。'],
    '推广中心': ['海报素材与配套朋友圈文案','按招募对象选择海报，匹配文案后保存或转发。','素材分类|文案与转发|重点测试','分类含合伙人、机构（心理/升学）、老师、学生家长。;每张海报绑定多条文案，可换一条、复制、保存或转发。;筛选、海报切换、文案匹配和分享面板。'],
    '推广中心配置': ['推广素材配置后台','维护小程序推广中心展示的海报图片、分类、说明、排序、朋友圈文案和上下架状态。','海报图片|文案配置|发布规则|重点测试','新增或编辑素材时上传 JPG、PNG 或 WEBP 海报，单张不超过 10MB；上传后应显示缩略图并可移除替换。;每张海报至少保留 1 条朋友圈文案，最多配置 5 条，单条最多 300 字；海报名称最多 30 字。;新增素材默认下架；上架后小程序才展示，切换下架前需要确认；删除素材及其文案后不可恢复。;查询筛选、分页、上传预览、海报详情预览、文案增删、上下架和删除确认。'],
    '教员资料': ['教师资料查看、审核与编辑','查看资料及审核状态；驳回时只展示原因，点击编辑资料后修改。','审核状态|字段规则|重点测试','审核中禁止重复提交；已驳回先看原因再进入编辑。;教学成果已删除；没有内容的字段不展示，选项按教师类型联动。;模拟驳回、查看原因、校验和重新提交。'],
    '课后反馈': ['教师端课程反馈填写','针对已完成课程填写课堂情况、学习表现、作业和建议。','填写规则|提交结果|重点测试','反馈绑定具体课程，必填未完成不可提交，空选填不展示。;提交后待反馈变为已完成，可分享至家长群。;字数、校验、防重复、状态回写和分享。'],
    '课程评价': ['家长端课程与教师评价','填写课程评分、老师评分和课程评价。','评价字段|提交规则|重点测试','两项评分均为1—5分且必填，评价文本显示字数。;每条课程仅提交一次，成功后更新为已评价。;评分独立、未评分、字数边界和重复提交。'],
    '课程详情': ['教师/家长共用课程详情','按来源和状态展示基础信息、反馈、作业及可执行操作。','信息规则|操作规则|地点规则|重点测试','没有内容的反馈、作业或字段不展示空占位。;教师待反馈显示填写反馈；家长待评价在基础信息右侧显示去评价。;线上：西安小寨交付中心；线下：西安小寨校区；上门：上门。;来源参数、身份、状态、空字段和操作入口。']
  };
  var cfg = common[page] || [page + '业务原型','展示本业务页面的信息结构、状态和操作。','开发约定|重点测试','没有内容的字段不展示。;页面加载、主要操作、空状态和返回路径。'];
  var heads = cfg[2].split('|'), bodies = cfg[3].split(';');
  var esc = function(v){return String(v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
  var style = document.createElement('style');
  style.textContent = '.global-dev-note{position:fixed;z-index:80;left:calc(50% + 285px);top:24px;width:min(400px,calc(50vw - 310px));max-height:calc(100vh - 48px);box-sizing:border-box;overflow:auto;padding:24px 26px 28px;border:1px solid #e0e5eb;color:#5d6878;background:#fff;box-shadow:0 12px 34px rgba(39,55,72,.14);font:14px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}.global-dev-note .dev-title{margin:0 0 18px;color:#17202c;font-size:24px}.global-dev-note .dev-live{margin-bottom:20px;padding:13px 15px;border-left:4px solid #f1a51b;background:#fff5e5;color:#89501a}.global-dev-note .dev-live strong{display:block;color:#7b4313}.global-dev-note .dev-live p,.global-dev-note .dev-summary{margin:0}.global-dev-note .dev-summary{margin-bottom:20px}.global-dev-note .dev-section{padding:17px 0;border-top:1px solid #e5e8ec}.global-dev-note .dev-section h3{margin:0 0 8px;color:#1e2630;font-size:17px}.global-dev-note .dev-section p{margin:0}@media(max-width:1180px){.global-dev-note{display:none!important}}';
  document.head.appendChild(style);
  var note = document.querySelector('.dev-note') || document.createElement('aside');
  note.className = 'dev-note global-dev-note'; note.setAttribute('aria-label','页面说明');
  note.innerHTML = '<h2 class="dev-title">页面说明</h2><div class="dev-live"><strong>本页说明｜'+esc(cfg[0])+'</strong><p id="globalDevLive">'+esc(cfg[1])+'</p></div><p class="dev-summary">'+esc(cfg[1])+'</p>'+heads.map(function(h,i){return '<section class="dev-section"><h3>'+esc(h)+'</h3><p>'+esc(bodies[i]||'')+'</p></section>';}).join('');
  if(!note.parentNode) document.body.appendChild(note);
  var live = note.querySelector('#globalDevLive');
  function label(t){return (t.innerText||t.getAttribute('aria-label')||t.textContent||'').replace(/\s+/g,' ').trim();}
  function field(t){var by=t.getAttribute('aria-labelledby'), lt=by&&document.getElementById(by)&&document.getElementById(by).textContent, ex=t.id&&document.querySelector('label[for="'+CSS.escape(t.id)+'"]');return (t.getAttribute('aria-label')||lt||(ex&&ex.textContent)||t.name||t.placeholder||'表单字段').replace(/\s+/g,' ').trim().slice(0,28);}
  function update(s){if(s){live.textContent=s;note.scrollTo({top:0,behavior:'smooth'});}}
  document.addEventListener('click',function(e){var t=e.target.closest('a,button,[role="button"],[role="link"],[data-action],[data-route],[data-filter],[data-tab]');if(!t)return;var s=label(t);update(t.matches('a[href]')?'当前交互：进入「'+s.slice(0,30)+'」，下一页继续承载该业务流程。':'当前交互：已操作「'+s.slice(0,44)+'」，请核对选中态、关联内容、按钮状态和数据是否同步变化。');},true);
  document.addEventListener('change',function(e){update('当前交互：正在编辑或筛选「'+field(e.target)+'」，页面数据和校验状态应同步更新。');},true);
  document.addEventListener('input',function(e){if(e.target.matches('input,textarea'))update('当前交互：正在填写「'+field(e.target)+'」，请同步校验内容、字数和提交按钮状态。');},true);
})();
