/** 随机事件库 —— 50 个,数据驱动,按区域标签匹配 */
import type { EventChoice, EventDef, EventEffect, EventOutcome } from '@/types'

function o(weight: number, text: string, ...effects: EventEffect[]): EventOutcome {
  return { weight, text, effects: effects.length ? effects : [{ type: 'nothing' }] }
}

function c(label: string, outcomes: EventOutcome[], opts: Partial<Omit<EventChoice, 'label' | 'outcomes'>> = {}): EventChoice {
  return { label, outcomes, ...opts }
}

function ev(
  id: string,
  title: string,
  text: string,
  tags: string[],
  choices: EventChoice[],
  opts: Partial<Pick<EventDef, 'minRealm' | 'once' | 'weight'>> = {}
): EventDef {
  return { id, title, text, tags, choices, weight: opts.weight ?? 100, minRealm: opts.minRealm, once: opts.once }
}

const leave = (text = '你摇了摇头,转身离去。') => c('离开', [o(1, text)], { isDefault: true })

export const EVENTS: EventDef[] = [
  ev(
    'ev_jade_slip',
    '古老玉简',
    '你在山洞深处发现一枚古老玉简,其上灵光隐现。',
    ['general'],
    [
      c('拾取', [
        o(50, '玉简中记载着一门功法残篇,你如获至宝。', { type: 'gongfa' }),
        o(30, '玉简早已破损,只余几页残卷。', { type: 'material', id: 'page', amount: 8 }),
        o(20, '玉简竟是他人设下的饵,灵力反噬,你受了些内伤。', { type: 'buff', id: 'injury' })
      ]),
      c(
        '观察',
        [
          o(70, '你仔细端详,悟出几分道韵。', { type: 'exp', reqPct: 0.05 }),
          o(30, '看不出所以然,你随手收起了几页残卷。', { type: 'material', id: 'page', amount: 3 })
        ],
        { isDefault: true }
      ),
      leave()
    ]
  ),
  ev(
    'ev_spring',
    '灵泉',
    '一汪清泉自石缝中涌出,泉水灵气氤氲。',
    ['general', 'mountain'],
    [
      c(
        '饮下泉水',
        [
          o(75, '泉水甘冽,灵气涌入四肢百骸。', { type: 'exp', reqPct: 0.08 }),
          o(25, '泉水中竟蕴含微量灵毒,你连忙运功逼出。', { type: 'buff', id: 'injury' })
        ],
        { isDefault: true }
      ),
      c('采集泉边灵草', [o(1, '你在泉边采得数株灵草。', { type: 'material', id: 'herb', amount: 6 })])
    ]
  ),
  ev(
    'ev_merchant',
    '游方商人',
    '一位背着大葫芦的游方商人拦住你,神秘兮兮地要与你做笔买卖。',
    ['general'],
    [
      c(
        '买下他的"仙缘"',
        [
          o(40, '你花了灵石,换来一枚品相不俗的丹药。', { type: 'stone', tierAmount: -30 }, { type: 'pill', count: 2 }),
          o(35, '竟真是好东西!一件灵光流转的法器。', { type: 'stone', tierAmount: -30 }, { type: 'equipment', minQualityRank: 2 }),
          o(25, '打开一看,不过是块顽石。你被骗了。', { type: 'stone', tierAmount: -30 })
        ],
        { hint: '需要灵石', cond: { type: 'stone', tierAmount: 30 } }
      ),
      c('婉拒', [o(1, '商人耸耸肩,吹着口哨走远了。')], { isDefault: true })
    ]
  ),
  ev(
    'ev_old_man',
    '青石上的老者',
    '一位老者坐在青石上打盹,身旁放着一个酒葫芦,气息深不可测。',
    ['general'],
    [
      c(
        '上前行礼',
        [
          o(55, '老者睁开一只眼,指点了你几句,字字珠玑。', { type: 'exp', reqPct: 0.1 }),
          o(30, '老者哈哈一笑,赠你一颗丹药,转眼不见踪影。', { type: 'pill', count: 1 }),
          o(15, '老者递来酒葫芦,你饮下一口,只觉道韵加身。', { type: 'buff', id: 'bless_daoyun' })
        ],
        { isDefault: true }
      ),
      c('悄悄绕开', [o(1, '你不欲多事,悄然离去。')])
    ]
  ),
  ev(
    'ev_beast_corpse',
    '妖兽尸骸',
    '一头妖兽的尸骸横在路旁,死去不久,周围隐有血腥气。',
    ['general', 'forest'],
    [
      c('剥取材料', [
        o(70, '你剥下有用之物,收获颇丰。', { type: 'material', id: 'herb', amount: 4 }, { type: 'material', id: 'ore', amount: 3 }),
        o(30, '杀死它的凶手去而复返!你且战且退,受了点伤。', { type: 'buff', id: 'injury' }, { type: 'material', id: 'ore', amount: 2 })
      ]),
      leave('血腥气太重,你决定绕道而行。')
    ]
  ),
  ev(
    'ev_formation',
    '残破阵法',
    '前方隐约有阵法波动,阵纹已残,似乎护着什么。',
    ['general', 'ruin'],
    [
      c('破阵而入', [
        o(45, '阵中是一处前人洞府,灵石俯拾皆是。', { type: 'stone', tierAmount: 60 }),
        o(30, '阵中只余一具枯骨与一件遗物。', { type: 'equipment', minQualityRank: 1 }),
        o(25, '阵法突然反噬,你狼狈退出。', { type: 'buff', id: 'injury' })
      ]),
      c('研究阵纹', [o(1, '你临摹阵纹,于阵道小有所悟。', { type: 'material', id: 'wudao', amount: 4 })], { isDefault: true })
    ]
  ),
  ev(
    'ev_lost_monk',
    '迷路的小和尚',
    '一个小和尚坐在路边哭,说自己找不到回寺的路了。',
    ['general'],
    [
      c(
        '送他回去',
        [
          o(70, '老方丈连声道谢,赠你一串开过光的念珠。', { type: 'equipment', minQualityRank: 1 }),
          o(30, '小和尚半路却化作一缕青烟——原是山灵考验人心。你只觉神清气爽。', { type: 'buff', id: 'bless_qingfeng' })
        ],
        { isDefault: true }
      ),
      c('指个方向便走', [o(1, '小和尚道了声谢,一步三回头地走了。')])
    ]
  ),
  ev(
    'ev_gamble',
    '路边赌石',
    '几个修士围着一堆灵石原石叫嚷,说是能开出宝贝。',
    ['general'],
    [
      c(
        '赌一把',
        [
          o(30, '石开!一团精纯灵气扑面而来!', { type: 'stone', tierAmount: -25 }, { type: 'stone', tierAmount: 90 }),
          o(20, '石中竟藏着一株灵药!', { type: 'stone', tierAmount: -25 }, { type: 'material', id: 'herb', amount: 12 }),
          o(50, '石头开了,里面什么都没有。', { type: 'stone', tierAmount: -25 })
        ],
        { hint: '需要灵石', cond: { type: 'stone', tierAmount: 25 } }
      ),
      c('看看热闹', [o(1, '你围观半晌,看破了庄家的手法,悄然离去。')], { isDefault: true })
    ]
  ),
  ev(
    'ev_thunder_bath',
    '雷雨夜',
    '暴雨骤至,雷霆在头顶炸开。有胆大的修士借雷淬体。',
    ['general', 'thunder'],
    [
      c('引雷淬体', [
        o(55, '雷霆入体,气血奔涌,你只觉浑身通透!', { type: 'exp', reqPct: 0.12 }),
        o(45, '你高估了自己,被雷劈得外焦里嫩。', { type: 'buff', id: 'injury' })
      ]),
      c('避雨静修', [o(1, '你寻了处山洞打坐,听雨声入定。', { type: 'exp', reqPct: 0.04 })], { isDefault: true })
    ]
  ),
  ev(
    'ev_herb_garden',
    '无主药园',
    '你发现一处荒废的药园,灵草虽杂,却也不少。',
    ['general', 'forest', 'mountain'],
    [
      c('仔细采摘', [o(1, '你采得满满一篓灵草。', { type: 'material', id: 'herb', amount: 10 })], { isDefault: true }),
      c('翻找园主遗物', [
        o(40, '你在小屋里找到一本泛黄的丹方笔记。', { type: 'material', id: 'wudao', amount: 6 }),
        o(35, '床底藏着一小袋灵石。', { type: 'stone', tierAmount: 40 }),
        o(25, '什么都没有,只有满屋灰尘。')
      ])
    ]
  ),
  ev(
    'ev_sword_stone',
    '插剑石',
    '一柄古剑插在巨石中,剑身布满铭文,无数人拔之不动。',
    ['general', 'sword', 'ruin'],
    [
      c('尝试拔剑', [
        o(15, '古剑轻鸣,竟应手而出!', { type: 'equipment', minQualityRank: 4 }),
        o(45, '剑纹一闪,一段剑道感悟涌入脑海。', { type: 'exp', reqPct: 0.08 }),
        o(40, '纹丝不动,你的手却被剑气所伤。', { type: 'buff', id: 'injury' })
      ]),
      c('参悟剑铭', [o(1, '你静观铭文,若有所思。', { type: 'material', id: 'wudao', amount: 5 })], { isDefault: true })
    ]
  ),
  ev(
    'ev_moon_lake',
    '月下湖泊',
    '月圆之夜,湖面浮起点点银辉,灵气随月光沉入水中。',
    ['general', 'water'],
    [
      c('湖畔吐纳', [o(1, '月华入体,修为悄然精进。', { type: 'exp', reqPct: 0.09 })], { isDefault: true }),
      c('潜入湖底', [
        o(40, '湖底沉着一只锈迹斑斑的铁盒。', { type: 'equipment', minQualityRank: 2 }),
        o(35, '你摸到几块温润的月华石。', { type: 'material', id: 'ore', amount: 8 }),
        o(25, '湖底暗流涌动,你差点没能上来。', { type: 'buff', id: 'injury' })
      ])
    ]
  ),
  ev(
    'ev_beggar',
    '褴褛乞丐',
    '一个乞丐伸手拦你:「小友,赏口饭吃,老朽必有厚报。」',
    ['general'],
    [
      c(
        '赠他灵石',
        [
          o(45, '乞丐眨眼消失,你手中多了一颗温热的丹药。', { type: 'stone', tierAmount: -15 }, { type: 'pill', count: 1 }),
          o(30, '乞丐郑重一拜:「善心可贵。」你只觉气运隆盛。', { type: 'stone', tierAmount: -15 }, { type: 'buff', id: 'bless_jiyuan' }),
          o(25, '乞丐千恩万谢地走了,什么也没发生。', { type: 'stone', tierAmount: -15 })
        ],
        { hint: '需要灵石', cond: { type: 'stone', tierAmount: 15 } }
      ),
      c('置之不理', [o(1, '你径直走过。修行路上,各安天命。')], { isDefault: true })
    ]
  ),
  ev(
    'ev_cave_in',
    '塌方',
    '前方山道突然塌方,烟尘中露出半截洞口。',
    ['general', 'mountain', 'ruin'],
    [
      c('进洞探查', [
        o(40, '洞中是一条矿脉!你挖得兴起。', { type: 'material', id: 'ore', amount: 12 }),
        o(35, '洞里蛛网密布,你只找到些破铜烂铁。', { type: 'material', id: 'dust', amount: 6 }),
        o(25, '二次塌方!你仓皇逃出,灰头土脸。', { type: 'buff', id: 'injury' })
      ]),
      leave('山体不稳,你不敢久留。')
    ]
  ),
  ev(
    'ev_chess',
    '石桌残局',
    '凉亭石桌上摆着一副残局,黑白胶着,似有玄机。',
    ['general'],
    [
      c('推演棋局', [
        o(50, '一子落定,满盘皆活!你于变化之道大有所悟。', { type: 'material', id: 'wudao', amount: 8 }),
        o(30, '棋局暗藏杀伐之意,你悟出几分战斗真谛。', { type: 'exp', reqPct: 0.06 }),
        o(20, '你陷入棋局心神难拔,醒来时已过许久,心浮气躁。', { type: 'buff', id: 'curse_xinmo' })
      ]),
      leave('你看了两眼,自知棋力不济,一笑而去。')
    ]
  ),
  ev(
    'ev_wounded_beast',
    '受伤的灵兽',
    '一只毛色雪白的小兽倒在草丛里,后腿受了伤,正瑟瑟发抖。',
    ['general', 'forest'],
    [
      c(
        '为它疗伤',
        [
          o(25, '小兽舔了舔你的手心,竟愿追随于你!', { type: 'pet' }),
          o(45, '小兽伤愈后衔来一株灵草相赠,消失在林中。', { type: 'material', id: 'herb', amount: 8 }),
          o(30, '小兽的母亲赶到,误会了你!一番纠缠后你才脱身。', { type: 'buff', id: 'injury' })
        ],
        { isDefault: true }
      ),
      c('取其内丹', [
        o(60, '你心一横下了手,取得一颗灵气充盈的内丹。', { type: 'exp', reqPct: 0.1 }),
        o(40, '你刚出手,一声兽吼震彻山林——它的母亲来了!', { type: 'buff', id: 'injury' })
      ])
    ]
  ),
  ev(
    'ev_night_talk',
    '夜遇同道',
    '篝火旁,一位同道修士邀你共坐,谈起各自的修行见闻。',
    ['general'],
    [
      c(
        '彻夜长谈',
        [
          o(60, '他山之石可以攻玉,你收获良多。', { type: 'material', id: 'wudao', amount: 5 }),
          o(40, '谈至兴起,他赠你一份不外传的心得。', { type: 'exp', reqPct: 0.06 })
        ],
        { isDefault: true }
      ),
      c('保持警惕', [
        o(70, '你敷衍几句便告辞,平安无事。'),
        o(30, '那修士见你戒备,冷笑一声化作黑雾散去——竟是心魔所化!', { type: 'buff', id: 'bless_qingfeng' })
      ])
    ]
  ),
  ev(
    'ev_falling_star',
    '流星坠地',
    '一道流光划破夜空,坠落在不远处的山谷。',
    ['general', 'sky'],
    [
      c(
        '前去查看',
        [
          o(45, '坠落的是一块陨铁,尚有余温。', { type: 'material', id: 'ore', amount: 15 }),
          o(30, '陨石中竟嵌着一件古物!', { type: 'equipment', minQualityRank: 3 }),
          o(25, '你赶到时,已有捷足先登者,只剩一地碎石。', { type: 'material', id: 'dust', amount: 4 })
        ],
        { isDefault: true }
      ),
      c('原地观星', [o(1, '你夜观天象,若有所悟。', { type: 'material', id: 'wudao', amount: 3 })])
    ]
  ),
  ev(
    'ev_hot_spring',
    '灵雾温泉',
    '山间温泉腾起灵雾,泡上一泡想必极为舒坦。',
    ['general', 'mountain', 'fire'],
    [
      c(
        '入泉沐浴',
        [
          o(80, '暖流洗去疲惫,你神完气足。', { type: 'buff', id: 'bless_qingfeng' }),
          o(20, '泉底竟沉着前人的储物袋!', { type: 'stone', tierAmount: 50 })
        ],
        { isDefault: true }
      ),
      leave('修行要紧,你没有停留。')
    ]
  ),
  ev(
    'ev_broken_cart',
    '倾覆的货车',
    '一辆商队货车翻在路边,货物散落,不见人影。',
    ['general'],
    [
      c('搬走货物', [
        o(55, '车上多是凡俗货物,但也翻出些值钱的。', { type: 'stone', tierAmount: 35 }),
        o(25, '货箱夹层里藏着一瓶丹药!', { type: 'pill', count: 2 }),
        o(20, '商队护卫去而复返,你被当成劫匪一顿好打。', { type: 'buff', id: 'injury' })
      ]),
      c(
        '寻找幸存者',
        [o(60, '你救起昏迷的商人,他以灵石相谢。', { type: 'stone', tierAmount: 45 }), o(40, '四下无人,只有风声。你留下标记便离开了。')],
        { isDefault: true }
      )
    ]
  ),
  ev(
    'ev_mirage_tower',
    '雾中高塔',
    '浓雾中隐约立着一座高塔,塔门半开,里面漆黑一片。',
    ['general', 'ruin', 'dark'],
    [
      c('登塔', [
        o(35, '塔中每层皆有传承刻文,你受益匪浅。', { type: 'exp', reqPct: 0.1 }, { type: 'material', id: 'wudao', amount: 5 }),
        o(30, '顶层供着一件蒙尘的法器。', { type: 'equipment', minQualityRank: 3 }),
        o(35, '塔中阴气缠身,你逃出时脸色发白。', { type: 'buff', id: 'curse_xinmo' })
      ]),
      leave('塔影幢幢,你压下好奇心,绕塔而行。')
    ]
  ),
  ev(
    'ev_immortal_dream',
    '仙人入梦',
    '午夜小憩,你梦见一位白衣仙人在云端讲道。',
    ['general'],
    [
      c(
        '凝神听讲',
        [
          o(60, '醒来后口齿留香,道音犹在耳畔。', { type: 'exp', reqPct: 0.08 }),
          o(30, '仙人抛下一卷经书,梦醒时它竟真在你怀中!', { type: 'gongfa' }),
          o(10, '仙人回眸一笑:「有缘人,赠你一场造化。」', { type: 'buff', id: 'bless_daoyun' })
        ],
        { isDefault: true }
      ),
      c('强行醒来', [o(1, '你警觉这或是心魔幻境,强行醒转,一身冷汗。')])
    ],
    { weight: 60 }
  ),
  ev(
    'ev_ant_nest',
    '蚁穴藏珍',
    '你注意到一队灵蚁正搬运着闪光的碎屑进入巢穴。',
    ['general', 'forest'],
    [
      c('挖开蚁穴', [
        o(60, '蚁穴深处堆着不少灵石碎屑。', { type: 'stone', tierAmount: 30 }),
        o(40, '蚁后震怒,万蚁齐出!你抱头鼠窜。', { type: 'buff', id: 'injury' })
      ]),
      c('跟踪来源', [o(1, '你顺藤摸瓜,找到了灵蚁的采集地。', { type: 'material', id: 'ore', amount: 6 })], { isDefault: true })
    ]
  ),
  ev(
    'ev_rain_shelter',
    '破庙避雨',
    '大雨滂沱,你躲进一座破败的山神庙。神像的眼睛似乎动了一下。',
    ['general', 'dark', 'ruin'],
    [
      c(
        '上香祭拜',
        [
          o(55, '香烟笔直升起,山神显灵,庇佑于你。', { type: 'buff', id: 'bless_jiyuan' }),
          o(45, '神像轰然倒塌,露出里面藏着的小盒子。', { type: 'equipment', minQualityRank: 1 })
        ],
        { isDefault: true }
      ),
      c('拆神像取宝', [
        o(40, '神像腹中果然有前人藏的灵石!', { type: 'stone', tierAmount: 55 }),
        o(60, '你刚动手,一道阴风卷过,你被摄去了一缕精气。', { type: 'buff', id: 'curse_xinmo' })
      ])
    ]
  ),
  ev(
    'ev_qin_sound',
    '深谷琴音',
    '幽谷中传来断断续续的琴声,时而杀伐,时而缥缈。',
    ['general', 'mountain'],
    [
      c('循声而去', [
        o(50, '抚琴的是位隐士,一曲终了,你如醍醐灌顶。', { type: 'material', id: 'wudao', amount: 10 }),
        o(30, '琴声戛然而止,石上只留一张琴谱。', { type: 'gongfa' }),
        o(20, '琴音入耳化作杀伐之意,你心神受创。', { type: 'buff', id: 'curse_xinmo' })
      ]),
      c('远远聆听', [o(1, '你在谷口听完一曲,心境平和。', { type: 'buff', id: 'bless_qingfeng' })], { isDefault: true })
    ]
  ),
  ev(
    'ev_treasure_map',
    '残缺藏宝图',
    '你从一具枯骨手中发现半张藏宝图,标记就在附近。',
    ['general', 'ruin'],
    [
      c(
        '按图索骥',
        [
          o(40, '掘地三尺,果然挖出一个储物匣!', { type: 'stone', tierAmount: 70 }, { type: 'material', id: 'dust', amount: 5 }),
          o(30, '宝藏早被人取走,只剩一个空坑和一件遗落的物件。', { type: 'equipment', minQualityRank: 2 }),
          o(30, '图是假的,你白挖了半天,腰酸背痛。')
        ],
        { isDefault: true }
      ),
      c('焚图祭亡者', [o(1, '你将图纸烧予枯骨:「宝物随缘,前辈安息。」心境圆融少许。', { type: 'material', id: 'wudao', amount: 4 })])
    ]
  ),
  ev(
    'ev_yaodan_auction',
    '黑市拍卖',
    '一处隐秘的黑市正在拍卖一颗成色极好的妖丹。',
    ['general', 'dark'],
    [
      c(
        '参与竞拍',
        [
          o(50, '你拍下妖丹,炼化后修为大涨。', { type: 'stone', tierAmount: -60 }, { type: 'exp', reqPct: 0.15 }),
          o(30, '有人恶意抬价,你多花了不少,好在妖丹货真价实。', { type: 'stone', tierAmount: -80 }, { type: 'exp', reqPct: 0.15 }),
          o(20, '拍到手才发现是颗赝品,黑市早已人去楼空。', { type: 'stone', tierAmount: -60 })
        ],
        { hint: '需要较多灵石', cond: { type: 'stone', tierAmount: 80 } }
      ),
      leave('黑市水深,你转了一圈便离开了。')
    ]
  ),
  ev(
    'ev_face_wall',
    '面壁人影',
    '崖壁前盘坐着一道人影,一动不动,已在此面壁不知多少年。',
    ['general', 'mountain'],
    [
      c(
        '静坐相陪',
        [
          o(60, '你陪坐三日,起身时只觉道心通透。', { type: 'material', id: 'wudao', amount: 8 }),
          o(40, '人影忽然散去——那只是一道残留的道韵。你若有所失,又若有所得。', { type: 'exp', reqPct: 0.08 })
        ],
        { isDefault: true }
      ),
      c('出声询问', [
        o(50, '人影缓缓道出一句偈语,便再无声息。', { type: 'material', id: 'wudao', amount: 5 }),
        o(50, '人影蓦然回首,双目如电!你被吓得不轻。', { type: 'buff', id: 'curse_xinmo' })
      ])
    ]
  ),
  ev(
    'ev_lingzhi',
    '千年灵芝',
    '峭壁之上,一株千年灵芝迎风轻晃,下方是万丈深渊。',
    ['mountain', 'forest'],
    [
      c('攀崖采摘', [
        o(55, '有惊无险,灵芝到手!', { type: 'material', id: 'herb', amount: 20 }),
        o(25, '灵芝下竟压着前人的遗物。', { type: 'equipment', minQualityRank: 2 }),
        o(20, '手一滑,你摔下数丈,幸被古藤接住。', { type: 'buff', id: 'injury' })
      ]),
      leave('君子不立危墙之下,你按捺住贪念。')
    ]
  ),
  ev(
    'ev_mine_vein',
    '裸露矿脉',
    '山洪冲刷后,一条玄铁矿脉裸露在外,矿石泛着乌光。',
    ['mountain', 'ruin'],
    [
      c(
        '放手开采',
        [
          o(70, '你采得大量玄铁,满载而归。', { type: 'material', id: 'ore', amount: 18 }),
          o(30, '采矿声惊动了附近的妖兽,你且采且战。', { type: 'material', id: 'ore', amount: 10 }, { type: 'buff', id: 'injury' })
        ],
        { isDefault: true }
      ),
      c('只取表层', [o(1, '你浅尝辄止,取了些浮矿便走。', { type: 'material', id: 'ore', amount: 7 })])
    ]
  ),
  ev(
    'ev_god_tree',
    '参天神木',
    '一棵需百人合抱的神木立于林心,树洞中隐有灵光。',
    ['forest'],
    [
      c('探入树洞', [
        o(45, '树洞中是历代鸟兽衔来的"收藏",琳琅满目。', { type: 'stone', tierAmount: 45 }, { type: 'material', id: 'herb', amount: 8 }),
        o(30, '一枚温润的果实静静躺在洞底。', { type: 'pill', count: 1 }),
        o(25, '树洞的主人回来了——一只暴躁的妖猿!', { type: 'buff', id: 'injury' })
      ]),
      c('树下打坐', [o(1, '神木灵气庇护,你修炼事半功倍。', { type: 'exp', reqPct: 0.07 })], { isDefault: true })
    ]
  ),
  ev(
    'ev_firebird',
    '浴火之羽',
    '一根燃烧的羽毛自天际飘落,火光中隐有凤鸣。',
    ['fire', 'sky'],
    [
      c('伸手接住', [
        o(50, '羽毛化作一缕真火没入体内,气血如沸!', { type: 'exp', reqPct: 0.12 }),
        o(30, '羽毛落地化作一枚赤红丹丸。', { type: 'pill', count: 1 }),
        o(20, '真火灼手,你被烫得不轻。', { type: 'buff', id: 'injury' })
      ]),
      c('目送其落', [o(1, '羽毛落地即熄,只余一小撮暖灰。', { type: 'material', id: 'dust', amount: 5 })], { isDefault: true })
    ]
  ),
  ev(
    'ev_lava_forge',
    '地火炉窟',
    '你发现一处天然地火喷口,火苗精纯,是炼器的绝佳之地。',
    ['fire', 'ruin'],
    [
      c('借火炼器', [
        o(60, '地火淬炼,你随手打造的器胚都不同凡响。', { type: 'equipment', minQualityRank: 2 }),
        o(40, '火候失控,器胚炸裂,你被崩了一脸灰。', { type: 'material', id: 'dust', amount: 8 })
      ]),
      c('采集火髓', [o(1, '你在喷口边缘刮取了些许火髓精华。', { type: 'material', id: 'ore', amount: 10 })], { isDefault: true })
    ]
  ),
  ev(
    'ev_drift_bottle',
    '漂流玉瓶',
    '一只玉瓶随波漂来,瓶口以符纸封着。',
    ['water'],
    [
      c('开瓶', [
        o(45, '瓶中是前人求救的遗书与报酬——如今物归有缘人。', { type: 'stone', tierAmount: 50 }),
        o(30, '瓶中封着一缕精魄,它道谢后散去,留予你一场造化。', { type: 'buff', id: 'bless_jiyuan' }),
        o(25, '瓶中冲出一股怨气,缠上了你!', { type: 'buff', id: 'curse_xinmo' })
      ]),
      leave('来历不明之物,你没有妄动。')
    ]
  ),
  ev(
    'ev_turtle',
    '驮碑老龟',
    '一只背驮石碑的老龟浮出水面,人言道:「小辈,可愿听老朽讲个故事?」',
    ['water'],
    [
      c(
        '洗耳恭听',
        [
          o(70, '老龟讲了一段上古秘辛,你听得如痴如醉。', { type: 'material', id: 'wudao', amount: 10 }),
          o(30, '故事讲罢,老龟从背上的碑文里抖落一页古篆。', { type: 'gongfa' })
        ],
        { isDefault: true }
      ),
      c('婉言谢绝', [o(1, '老龟叹了口气,缓缓沉入水中。')])
    ]
  ),
  ev(
    'ev_pearl',
    '蚌中明珠',
    '浅滩上一只巨蚌微张,珠光自缝隙中透出。',
    ['water'],
    [
      c('取珠', [
        o(55, '明珠到手,温润生辉。', { type: 'stone', tierAmount: 65 }),
        o(45, '巨蚌猛然合拢,差点夹断你的手!', { type: 'buff', id: 'injury' })
      ]),
      leave('取珠伤蚌,非修道人所为。你转身离去,心境澄明。')
    ]
  ),
  ev(
    'ev_ghost_lantern',
    '引路鬼灯',
    '夜色中一盏青灯悬在半空,缓缓向密林深处飘去。',
    ['dark'],
    [
      c('跟随灯火', [
        o(40, '青灯引你至一处遗冢,陪葬之物犹在。', { type: 'equipment', minQualityRank: 2 }, { type: 'material', id: 'dust', amount: 4 }),
        o(30, '灯下坐着一位等了百年的魂灵,托你了却尘缘后消散,留下谢礼。', { type: 'stone', tierAmount: 55 }),
        o(30, '灯火骤灭,阴风四起!你且战且退。', { type: 'buff', id: 'injury' })
      ]),
      leave('子不语怪力乱神,你目不斜视地走过。')
    ]
  ),
  ev(
    'ev_bone_scripture',
    '骨刻经文',
    '一具盘坐的枯骨前散落着骨片,其上刻满细密经文。',
    ['dark', 'ruin'],
    [
      c('拾骨参读', [
        o(50, '经文玄奥,你抄录下来细细参悟。', { type: 'material', id: 'wudao', amount: 8 }, { type: 'material', id: 'page', amount: 6 }),
        o(25, '这竟是一部散佚的功法!', { type: 'gongfa' }),
        o(25, '经文中藏着前人的执念,读之心魔暗生。', { type: 'buff', id: 'curse_xinmo' })
      ]),
      c('葬骨立碑', [o(1, '你将枯骨安葬。尘归尘,土归土,你只觉因果两清。', { type: 'buff', id: 'bless_jiyuan' })], { isDefault: true })
    ]
  ),
  ev(
    'ev_starfall_pool',
    '星辉池',
    '荒原凹地积起一汪池水,倒映的星光竟不随云动。',
    ['sky'],
    [
      c(
        '掬水而饮',
        [
          o(60, '星辉入腹,神魂为之一清。', { type: 'exp', reqPct: 0.1 }),
          o(40, '池水冰寒刺骨,你打了个激灵,灵台空明。', { type: 'material', id: 'wudao', amount: 6 })
        ],
        { isDefault: true }
      ),
      c('池底摸索', [
        o(50, '池底沉着几块陨落的星髓。', { type: 'material', id: 'ore', amount: 14 }),
        o(50, '你搅碎了满池星光,什么也没捞到。')
      ])
    ]
  ),
  ev(
    'ev_void_crack',
    '虚空裂缝',
    '空气中悬着一道细小的裂缝,深处传来若有若无的呼唤。',
    ['sky', 'dark'],
    [
      c('探手其中', [
        o(35, '你摸到一件冰凉的古物!', { type: 'artifact' }),
        o(35, '一股精纯之气顺着手臂涌入体内。', { type: 'exp', reqPct: 0.12 }),
        o(30, '裂缝猛然收缩!你抽手不及,受了伤。', { type: 'buff', id: 'injury' })
      ]),
      leave('虚空凶险,你退避三舍。')
    ],
    { weight: 60 }
  ),
  ev(
    'ev_fairy_field',
    '仙田遗种',
    '一小片荒芜的仙田里,竟还有一株灵植倔强地活着。',
    ['sky', 'ruin'],
    [
      c(
        '小心移栽',
        [
          o(60, '灵植在你手中焕发生机,结出几枚灵果。', { type: 'material', id: 'herb', amount: 16 }),
          o(40, '移栽失败,灵植枯萎,你惋惜地收起残叶。', { type: 'material', id: 'herb', amount: 5 })
        ],
        { isDefault: true }
      ),
      c('原地培育', [
        o(1, '你守着仙田数日,灵植开花结果。', { type: 'material', id: 'herb', amount: 10 }, { type: 'material', id: 'wudao', amount: 3 })
      ])
    ]
  ),
  ev(
    'ev_ice_coffin',
    '寒冰棺椁',
    '万年玄冰中封着一具棺椁,棺中人容颜如生。',
    ['ice', 'ruin'],
    [
      c('叩拜离去', [o(1, '你郑重三拜。冥冥中似有一道目光注视着你,片刻后隐去。', { type: 'buff', id: 'bless_jiyuan' })], {
        isDefault: true
      }),
      c('破冰探棺', [
        o(40, '棺旁陪葬着一件保存完好的古物。', { type: 'equipment', minQualityRank: 3 }),
        o(30, '棺中人指间夹着一页玉笺,似是留给后来者。', { type: 'gongfa' }),
        o(30, '寒气反噬!你冻得嘴唇发紫。', { type: 'buff', id: 'injury' })
      ])
    ]
  ),
  ev(
    'ev_heart_demon',
    '心魔叩关',
    '静修时,一个与你一模一样的身影在识海中冷笑:「你修的道,是真的吗?」',
    ['general'],
    [
      c('直面心魔', [
        o(60, '你与"自己"对峙三日,道心愈发坚定。', { type: 'material', id: 'wudao', amount: 12 }),
        o(40, '心魔狡诈,你落了下风,道行受损。', { type: 'buff', id: 'curse_xinmo' })
      ]),
      c('置之不理', [o(70, '你不闻不问,心魔自讨没趣地散了。'), o(30, '心魔趁虚而入,扰你清修。', { type: 'buff', id: 'curse_xinmo' })], {
        isDefault: true
      })
    ],
    { minRealm: 2 }
  ),
  ev(
    'ev_dao_stone',
    '问道石',
    '一块古碑立于路旁,上书两个古字:「问道」。据说触碑者可得一问。',
    ['general'],
    [
      c('以手触碑', [
        o(50, '古碑微光流转,你心中一个困惑已久的关隘豁然贯通。', { type: 'exp', reqPct: 0.15 }),
        o(30, '碑中传出一声轻叹,一页古老的纸卷飘落。', { type: 'material', id: 'page', amount: 10 }),
        o(20, '古碑纹丝不动。或许,你的问题还不够格。')
      ]),
      leave('道在己身,不假外求。你笑了笑,继续赶路。')
    ],
    { minRealm: 3, weight: 60 }
  ),
  ev(
    'ev_pill_furnace',
    '无主丹炉',
    '崖洞中一尊丹炉犹自温热,炉主人却已不知去向。',
    ['general', 'ruin', 'fire'],
    [
      c('开炉取丹', [
        o(45, '炉中一炉丹药刚好炼成!', { type: 'pill', count: 3 }),
        o(30, '丹已成灰,但炉底结着一层精纯丹髓。', { type: 'material', id: 'herb', amount: 12 }),
        o(25, '开炉瞬间药力冲腾,你吸入过量药气,头晕目眩。', { type: 'buff', id: 'injury' })
      ]),
      leave('丹炉主人恐有不测,你不愿沾染因果。')
    ]
  ),
  ev(
    'ev_wine_immortal',
    '醉卧仙人',
    '一位酒气冲天的邋遢道人醉卧道旁,怀里的酒葫芦滚到了你脚边。',
    ['general'],
    [
      c(
        '拾葫芦归还',
        [
          o(50, '道人眯眼一笑,请你共饮一口。入喉如吞云霞!', { type: 'exp', reqPct: 0.1 }),
          o(30, '道人打个酒嗝:「有心了。」随手赏你一物。', { type: 'artifact' }),
          o(20, '道人呼呼大睡,你把葫芦放回他怀里,悄然离去。', { type: 'buff', id: 'bless_qingfeng' })
        ],
        { isDefault: true }
      ),
      c('偷喝一口', [
        o(40, '仙酿入喉,妙不可言!', { type: 'exp', reqPct: 0.12 }),
        o(60, '「小贼!」道人眼皮都没抬,一个酒嗝把你熏得七荤八素。', { type: 'buff', id: 'injury' })
      ])
    ],
    { weight: 70 }
  ),
  ev(
    'ev_market_day',
    '山下集市',
    '恰逢山下小镇赶集,人声鼎沸,烟火气扑面而来。',
    ['general'],
    [
      c(
        '入市闲逛',
        [
          o(50, '你在旧货摊上淘到一件被当作凡物的宝贝。', { type: 'equipment', minQualityRank: 1 }),
          o(30, '你帮镇民驱走了捣乱的野兽,收获一堆谢礼。', { type: 'stone', tierAmount: 30 }, { type: 'material', id: 'herb', amount: 5 }),
          o(20, '你尝遍小吃,红尘烟火,亦是修行。', { type: 'buff', id: 'bless_qingfeng' })
        ],
        { isDefault: true }
      ),
      c('过门不入', [o(1, '红尘滚滚,你心如止水地走过。', { type: 'material', id: 'wudao', amount: 2 })])
    ]
  ),
  ev(
    'ev_ancient_gate',
    '无字石门',
    '半山腰嵌着一扇巨大的石门,无锁无缝,门前刻着一行小字:「有缘者入」。',
    ['general', 'ruin'],
    [
      c('推门', [
        o(30, '石门轰然开启!门后小殿中供着前人留下的传承。', { type: 'gongfa' }, { type: 'stone', tierAmount: 40 }),
        o(40, '石门纹丝不动,但门上道纹让你若有所悟。', { type: 'material', id: 'wudao', amount: 6 }),
        o(30, '石门震出一股罡气,你被推得连退数步。', { type: 'buff', id: 'injury' })
      ]),
      leave('缘分未到,强求无益。')
    ],
    { weight: 70 }
  ),
  ev(
    'ev_rescue_disciple',
    '遇袭的弟子',
    '前方打斗声起,一名宗门弟子正被数只妖兽围攻,险象环生。',
    ['general', 'forest', 'mountain'],
    [
      c(
        '出手相救',
        [
          o(65, '你击退妖兽。弟子感激涕零,以宗门丹药相谢。', { type: 'pill', count: 2 }),
          o(35, '救人成功,你却也挂了彩。弟子留下谢礼匆匆离去。', { type: 'stone', tierAmount: 40 }, { type: 'buff', id: 'injury' })
        ],
        { isDefault: true }
      ),
      c('静观其变', [
        o(50, '弟子自行突围而去,你捡了点妖兽掉落之物。', { type: 'material', id: 'ore', amount: 5 }),
        o(
          50,
          '弟子力竭陨落。你叹了口气,收敛其遗物,立坟安葬。',
          { type: 'equipment', minQualityRank: 1 },
          { type: 'buff', id: 'curse_xinmo' }
        )
      ])
    ]
  ),
  ev(
    'ev_border_stall',
    '云雾茶摊',
    '山道旁不知何时支起一座茶摊,摊主是位笑眯眯的老妪,茶香远远飘来。',
    ['general'],
    [
      c(
        '坐下喝碗茶',
        [
          o(60, '一碗粗茶下肚,连日疲惫一扫而空。', { type: 'buff', id: 'bless_qingfeng' }),
          o(25, '老妪多看了你两眼:「小娃娃面相不俗。」赠你一包晒干的灵草。', { type: 'material', id: 'herb', amount: 8 }),
          o(15, '茶汤入喉竟有道韵流转——这哪里是凡茶!待你回神,茶摊已消失无踪。', { type: 'buff', id: 'bless_daoyun' })
        ],
        { isDefault: true }
      ),
      c(
        '付双倍茶钱',
        [
          o(
            70,
            '老妪眉开眼笑,往你茶碗里多添了一勺蜜。你只觉气运都顺了几分。',
            { type: 'stone', tierAmount: -10 },
            { type: 'buff', id: 'bless_jiyuan' }
          ),
          o(30, '老妪摆摆手不肯多收,只道:「出门在外,与人为善。」', { type: 'material', id: 'wudao', amount: 3 })
        ],
        { hint: '需要灵石', cond: { type: 'stone', tierAmount: 10 } }
      )
    ]
  ),
  ev(
    'ev_stargazer',
    '观星台残址',
    '断崖上立着半座残破的观星台,石盘上的星图仍在缓缓流转。',
    ['general', 'ruin', 'sky'],
    [
      c('推演星图', [
        o(55, '星轨入目,你于命数一道略有所悟。', { type: 'material', id: 'wudao', amount: 7 }),
        o(25, '星图深处竟藏着一段观想法门!', { type: 'gongfa' }),
        o(20, '星光刺目,你双眼酸胀,险些迷了心神。', { type: 'buff', id: 'curse_xinmo' })
      ]),
      leave('天机莫测,你看了两眼便移开目光。')
    ]
  )
]

/**
 * 机缘事件(Phase 31.0 S2)——— 极低概率、带代价选择、影响构筑方向
 * 与普通事件池分离:触发概率低,遇后必须面临"取 / 弃"的决策
 */
export const FORTUNE_EVENTS: EventDef[] = [
  ev(
    'ft_sword_remnant',
    '上古剑痕',
    '荒山石壁上留着三道剑痕,每一道都深可没指,剑气未散。',
    ['general', 'ruin'],
    [
      c('参悟剑痕', [
        o(65, '剑意入怀,你只觉得剑之一道豁然开朗。', { type: 'gongfa', id: 's_lianxi' }),
        o(20, '剑气反噬,你吐出一口血,却记下了几分剑理。', { type: 'buff', id: 'injury' }, { type: 'material', id: 'page', amount: 12 }),
        o(15, '剑痕只是一道残影,你看罢两手空空。', { type: 'nothing' })
      ]),
      c('绕道而行', [o(1, '剑气凛冽,你压下好奇,转身离去。')], { isDefault: true })
    ]
  ),
  ev(
    'ft_ancient_elixir',
    '失传丹方',
    '一座荒废丹房,案上摊着一卷泛黄的丹方,墨迹犹新。',
    ['general'],
    [
      c('记下丹方', [
        o(60, '丹方奥妙无穷,你收下残页,悟得炼丹真意。', { type: 'material', id: 'wudao', amount: 10 }, { type: 'material', id: 'page', amount: 6 }),
        o(40, '丹方后半已被虫蛀,只得残缺几字。', { type: 'material', id: 'page', amount: 12 })
      ]),
      c('放回原处', [o(1, '前人遗物,你不敢轻动,悄然离开。')], { isDefault: true })
    ]
  ),
  ev(
    'ft_beast_pledge',
    '妖兽认主',
    '一头通体雪白的幼兽从草丛探出头,竟不惧人,蹭着你的裤脚不放。',
    ['general', 'forest'],
    [
      c('带它同行', [
        o(70, '幼兽灵气盎然,愿意追随于你——喜得一灵兽!', { type: 'pet' }),
        o(30, '幼兽随了一段路便跑开了,你只留下一段记忆。', { type: 'material', id: 'herb', amount: 6 })
      ]),
      c('轻轻放它离去', [o(1, '你摆摆手,幼兽一步三回头地走了。')], { isDefault: true })
    ]
  ),
  ev(
    'ft_reclusive_elder',
    '隐世高人',
    '竹屋前一位老翁在打坐,袈裟破旧,气息却深如渊海。',
    ['general', 'mountain'],
    [
      c('上前叩拜', [
        o(55, '老翁抬眸只瞥了你一眼,一缕道韵没入你眉心。', { type: 'exp', reqPct: 0.15 }),
        o(25, '老翁递来一枚丹药,转身已不见踪影。', { type: 'pill', count: 2 }),
        o(20, '老翁摇摇头:「你缘未至。」你悻悻而返。', { type: 'nothing' })
      ]),
      c('不去打扰', [o(1, '高人清修,你静立片刻,悄然离去。')], { isDefault: true })
    ]
  ),
  ev(
    'ft_blood_contract',
    '残缺秘术',
    '一块染血的龟甲横陈路中,上面的纹路似是一种秘术。',
    ['general', 'dark'],
    [
      c('读取秘术', [
        o(50, '秘术艰深,你气血翻涌,却强记下来。', { type: 'buff', id: 'injury' }, { type: 'material', id: 'wudao', amount: 12 }),
        o(50, '龟甲上的血纹竟是一段禁法,你看了便心悸。', { type: 'buff', id: 'curse_xinmo' })
      ]),
      c('掩埋龟甲', [o(1, '此物不祥,你掘土掩埋,心念一清。')], { isDefault: true })
    ]
  )
]

const FORTUNE_BY_ID = new Map(FORTUNE_EVENTS.map(x => [x.id, x]))

export function fortuneEventDef(id: string): EventDef | undefined {
  return FORTUNE_BY_ID.get(id)
}

const BY_ID = new Map(EVENTS.map(x => [x.id, x]))

export function eventDef(id: string): EventDef | undefined {
  return BY_ID.get(id)
}
