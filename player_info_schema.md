# SF6 玩家信息 JSON 数据结构注释说明

## 顶层结构
```json
{
  "pageProps": { ... },    // 页面属性，包含所有玩家数据
  "__N_SSP": true          // Next.js 服务端渲染标志
}
```

---

## pageProps.fighter_banner_info - 玩家基本信息横幅

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `allow_cross_play` | boolean | 是否允许跨平台对战 |
| `battle_input_type` | int | 战斗输入类型（0=经典，1=现代） |
| `custom_room_invite_setting` | int | 自定义房间邀请设置（1=允许） |
| `enjoy_total_point` | int | 娱乐总积分 |
| `favorite_character_id` | int | 最爱角色ID |
| `favorite_character_league_info` | object | 最爱角色的段位信息 |
| `favorite_character_play_point` | object | 最爱角色的游玩点数 |
| `friend_request_flag` | boolean | 是否有好友请求 |
| `friendship` | int | 好友关系状态（1=已是好友） |
| `home_id` | int | 主页/地区ID |
| `inside_rank` | int | 内部排名 |
| `is_circle_invite` | boolean | 是否接受公会邀请 |
| `is_circle_member` | boolean | 是否是公会成员 |
| `last_play_at` | int | 最后游玩时间戳（Unix时间） |
| `main_circle` | object | 主公会信息 |
| `max_content_play_time` | object | 最大游玩时间的内容类型 |
| `mobile_linkage` | boolean | 是否绑定移动端 |
| `online_status_info` | object | 在线状态信息 |
| `personal_info` | object | 个人身份信息 |
| `play_time_zone` | object | 常玩时间段 |
| `profile_comment` | object | 个人资料标签/评论 |
| `title_plate` | int | 称号牌ID |
| `home_name` | string | 地区名称（如"中国"） |
| `favorite_character_name` | string | 最爱角色中文名 |
| `favorite_character_alpha` | string | 最爱角色显示名 |
| `favorite_character_tool_name` | string | 最爱角色英文名（用于工具/API） |
| `title_data` | object | 称号数据 |
| `is_my_data` | boolean | 是否是当前登录用户自己的数据 |

---

## fighter_banner_info.favorite_character_league_info - 最爱角色段位信息

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `league_point` | int | 段位积分（-1表示未定级） |
| `league_rank` | int | 段位等级编号 |
| `master_league` | int | Master段位等级（0表示非Master） |
| `master_rating` | int | Master评分（仅Master段位有效） |
| `master_rating_ranking` | int | Master评分排名 |
| `league_rank_info.league_rank_name` | string | 段位名称（如"Diamond4"） |
| `league_rank_info.league_rank_number` | int | 段位星级（如4星） |

---

## fighter_banner_info.personal_info - 个人身份信息

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `fighter_id` | string | 玩家ID/用户名 |
| `platform_id` | int | 平台ID（5=Steam） |
| `short_id` | int | 短ID（用于快速查找） |
| `platform_name` | string | 平台显示名称（如"Steam"） |
| `platform_tool_name` | string | 平台工具名称（如"steam"） |

---

## fighter_banner_info.online_status_info - 在线状态信息

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `online_status` | int | 在线状态码（1=离线） |
| `online_status_data.online_status_name` | string | 在线状态名称（如"离线状态"） |
| `online_status_data.online_status_type` | int | 在线状态类型 |
| `battlehub_admission_restriction` | int | 格斗中心准入限制 |
| `battlehub_id` | string | 格斗中心ID |
| `battlehub_platform_id` | int | 格斗中心平台ID |
| `battlehub_region_id` | int | 格斗中心区域ID |
| `battlehub_server_no` | int | 格斗中心服务器号 |
| `custom_room_master_short_id` | int | 自定义房间房主短ID |
| `custom_room_platform_id` | int | 自定义房间平台ID |
| `custom_room_publish_setting` | int | 自定义房间公开设置 |
| `custom_room_region_id` | int | 自定义房间区域ID |
| `custom_room_required_network_connection_quality` | int | 自定义房间网络质量要求 |
| `custom_room_required_pass_code` | boolean | 自定义房间是否需要密码 |
| `custom_room_room_id` | string | 自定义房间ID |

---

## fighter_banner_info.play_time_zone - 常玩时间段

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `start_hour` | int | 开始小时（24小时制） |
| `start_minute` | int | 开始分钟 |
| `end_hour` | int | 结束小时 |
| `end_minute` | int | 结束分钟 |

---

## fighter_banner_info.profile_comment - 个人资料标签

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `profile_tag_id` | int | 标签ID |
| `tag_option_id` | int | 标签选项ID |
| `profile_tag_name` | string | 标签模板（如"{{message1}}年后回归"） |
| `profile_tag_option` | string | 标签选项值（替换模板中的占位符） |

---

## fighter_banner_info.title_data - 称号数据

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `title_data_id` | int | 称号ID |
| `title_data_grade_id` | int | 称号等级ID |
| `title_data_grade_name` | string | 称号等级名称（如"銅"） |
| `title_data_plate_id` | int | 称号牌ID |
| `title_data_plate_name` | string | 称号牌资源名称 |
| `title_data_val` | string | 称号文本内容（如"大家好"） |

---

## pageProps.play - 游玩统计数据

### play.base_info - 基础游玩信息

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `content_play_time_list` | array | 各模式游玩时间列表 |
| `enjoy_fight_point` | int | 娱乐对战积分 |
| `enjoy_total_point` | int | 娱乐总积分 |
| `enjoy_user_point` | int | 娱乐用户积分 |

#### content_play_time_list 元素结构
| 字段名 | 类型 | 说明 |
|--------|------|------|
| `content_type` | int | 内容类型ID（见下方对照表） |
| `play_time` | int | 游玩时间（秒） |
| `content_type_name` | string | 内容类型名称 |

**content_type 对照表：**
- 1: 环球游历 (World Tour)
- 2: 排位赛 (Ranked Match)
- 3: 休闲赛 (Casual Match)
- 4: 我的比赛间对战 (Custom Room)
- 5: 格斗中心 (Battle Hub)
- 6: 离线赛 (Offline)
- 7: 街机 (Arcade)
- 8: 练习 (Training)
- 9: 特殊赛 (Special Match)
- 10: 虚拟形象房间 (Avatar Room)

---

### play.battle_stats - 对战统计数据

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `rank_match_play_count` | int | 排位赛对战次数 |
| `casual_match_play_count` | int | 休闲赛对战次数 |
| `custom_room_match_play_count` | int | 自定义房间对战次数 |
| `battle_hub_match_play_count` | int | 格斗中心对战次数 |
| `total_all_character_play_point` | int | 全角色总游玩点数 |
| `corner_time` | float | 将对手逼入墙角的时间占比 |
| `cornered_time` | float | 被逼入墙角的时间占比 |
| `drive_impact` | float | 斗气迸放使用率 |
| `drive_impact_to_drive_impact` | float | 斗气迸放对拼成功率 |
| `drive_parry` | float | 斗气招架使用率 |
| `drive_reversal` | float | 斗气反击使用率 |
| `just_parry` | float | 完美招架率 |
| `punish_counter` | float | 确反次数占比 |
| `stun` | float | 使对手眩晕次数占比 |
| `throw_count` | float | 投技成功次数占比 |
| `throw_tech` | float | 拆投率 |
| `received_drive_impact` | float | 受到斗气迸放次数占比 |
| `received_drive_impact_to_drive_impact` | float | 被斗气迸放对拼成功率 |
| `received_punish_counter` | float | 被确反次数占比 |
| `received_stun` | float | 被眩晕次数占比 |
| `received_throw_count` | float | 被投次数占比 |
| `received_throw_drive_parry` | float | 被投时斗气招架率 |
| `throw_drive_parry` | float | 投技被斗气招架率 |
| `gauge_rate_ca` | float | 超必杀技(CA)使用率 |
| `gauge_rate_drive_arts` | float | 斗气必杀技使用率 |
| `gauge_rate_drive_guard` | float | 斗气防御使用率 |
| `gauge_rate_drive_impact` | float | 斗气迸放使用率 |
| `gauge_rate_drive_other` | float | 其他斗气操作使用率 |
| `gauge_rate_drive_reversal` | float | 斗气反击使用率 |
| `gauge_rate_drive_rush_from_cancel` | float | 取消接斗气连击使用率 |
| `gauge_rate_drive_rush_from_parry` | float | 招架接斗气连击使用率 |
| `gauge_rate_sa_lv1` | float | Lv1超必杀使用率 |
| `gauge_rate_sa_lv2` | float | Lv2超必杀使用率 |
| `gauge_rate_sa_lv3` | float | Lv3超必杀使用率 |
| `target_clear_count` | int | 挑战完成次数 |
| `rival_ai_highest_league_rank` | int | V对手最高达到的段位 |
| `rival_ai_highest_league_rank_txt` | string | V对手最高段位文本（如"Master"） |
| `rival_ai_achieved_challenge_count` | int | V对手挑战完成数 |

---

### play.character_league_infos - 各角色段位信息数组

每个元素结构：
| 字段名 | 类型 | 说明 |
|--------|------|------|
| `character_id` | int | 角色ID |
| `is_played` | boolean | 是否使用过该角色 |
| `league_info` | object | 段位信息（同favorite_character_league_info结构） |
| `character_name` | string | 角色中文名 |
| `character_alpha` | string | 角色显示名 |
| `character_tool_name` | string | 角色英文名（用于API） |
| `character_sort` | int | 角色排序权重 |

---

### play.character_play_point_infos - 各角色游玩点数数组

每个元素结构：
| 字段名 | 类型 | 说明 |
|--------|------|------|
| `character_id` | int | 角色ID |
| `play_point` | object | 游玩点数对象 |
| `play_point.battle_hub` | int | 格斗中心游玩点数 |
| `play_point.fighting_ground` | int | 对战模式游玩点数 |
| `play_point.world_tour` | int | 环球游历游玩点数 |
| `character_name` | string | 角色中文名 |
| `character_alpha` | string | 角色显示名 |
| `character_tool_name` | string | 角色英文名 |
| `character_sort` | int | 角色排序权重 |

---

### play.character_win_rates - 各角色胜率数组

每个元素结构：
| 字段名 | 类型 | 说明 |
|--------|------|------|
| `character_id` | int | 角色ID |
| `battle_count` | int | 对战次数 |
| `win_count` | int | 胜利次数 |
| `character_name` | string | 角色中文名 |
| `character_alpha` | string | 角色显示名 |
| `character_tool_name` | string | 角色英文名 |
| `character_sort` | int | 角色排序权重 |

*注：最后一个元素 character_id=253 代表"全部"角色的汇总数据*

---

### play.character_win_rates_by_rival_character - 各角色对阵各对手的胜率

这是一个嵌套数组，外层按己方角色分组，内层是对阵各对手的战绩：

外层元素：
| 字段名 | 类型 | 说明 |
|--------|------|------|
| `character_id` | int | 己方角色ID |
| `rival_character_win_rates` | array | 对阵各对手的胜率数组 |

内层元素（rival_character_win_rates）：
| 字段名 | 类型 | 说明 |
|--------|------|------|
| `battle_count` | int | 对战次数 |
| `rival_character_id` | int | 对手角色ID |
| `win_count` | int | 胜利次数 |
| `rival_character_name` | string | 对手角色中文名 |
| `rival_character_alpha` | string | 对手角色显示名 |
| `rival_character_tool_name` | string | 对手角色英文名 |
| `rival_character_sort` | int | 对手角色排序权重 |

---

## main_circle - 主公会信息

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `circle_id` | string | 公会ID |
| `circle_name` | string | 公会名称 |
| `data_exist` | boolean | 公会数据是否存在 |
| `emblem` | object | 公会徽章配置 |
| `leader` | object | 公会会长信息 |

### emblem - 公会徽章配置
包含大量徽章视觉配置字段（底色、边框、图案、符号等），用于渲染公会徽章。

### leader - 公会会长信息
| 字段名 | 类型 | 说明 |
|--------|------|------|
| `fighter_id` | string | 会长玩家ID |
| `platform_id` | int | 会长平台ID |
| `short_id` | int | 会长短ID |

---

## max_content_play_time - 最大游玩时间内容

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `content_type` | int | 内容类型ID（8=练习） |
| `play_time` | int | 游玩时间（秒） |

---

## 角色ID对照表

| ID | 角色名 | 英文名 |
|----|--------|--------|
| 1 | 隆 | ryu |
| 2 | 卢克 | luke |
| 3 | 金柏莉 | kimberly |
| 4 | 春丽 | chunli |
| 5 | 曼侬 | manon |
| 6 | 桑吉尔夫 | zangief |
| 7 | JP | jp |
| 8 | 达尔西姆 | dhalsim |
| 9 | 嘉米 | cammy |
| 10 | 肯 | ken |
| 11 | 迪·杰 | deejay |
| 12 | 莉莉 | lily |
| 13 | 阿鬼 | aki |
| 14 | 拉希德 | rashid |
| 15 | 布兰卡 | blanka |
| 16 | 韩蛛俐 | juri |
| 17 | 玛丽莎 | marisa |
| 18 | 古烈 | guile |
| 19 | 爱德 | ed |
| 20 | 埃德蒙·本田 | honda |
| 21 | 杰米 | jamie |
| 22 | 豪鬼 | gouki |
| 25 | 沙加特 | sagat |
| 26 | 维加 | vega |
| 27 | 特瑞 | terry |
| 28 | 舞 | mai |
| 29 | 艾琳娜 | elena |
| 30 | 深红毒蛇 | cviper |
| 31 | 阿里克斯 | alex |
| 32 | 英格丽德 | ingrid |
| 253 | 全部 | all |
| 254 | 随机 | random |

---

## 段位等级对照表

| league_rank | 段位名称 |
|-------------|----------|
| 39 | 未定级/无段位 |
| 30-38 | Iron/Bronze/Silver/Gold/Platinum/Diamond |
| 36 | Master |

*注：具体段位名称由 league_rank_info.league_rank_name 提供*
