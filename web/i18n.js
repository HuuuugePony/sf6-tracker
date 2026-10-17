// UI-only localization. Canonical battle data, player names and user notes stay untouched.
const UI_LANGUAGES = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko'];
let uiLanguage = 'zh-CN';
const UI_MESSAGES = new Map();
function addUiMessages(rows) {
    for (const row of rows) {
        const [zh, en, ja, ko, tw = zh] = row;
        UI_MESSAGES.set(zh, {'zh-CN': zh, 'zh-TW': tw, en, ja, ko});
    }
}
addUiMessages([
    ['主页','Home','ホーム','홈','主頁'],
    ['查询','Search','検索','검색','查詢'],
    ['排行榜','Rankings','ランキング','랭킹'],
    ['格斗圈','Fighters','ファイター','파이터','格鬥圈'],
    ['本地历史','Local history','ローカル履歴','로컬 기록','本機歷史'],
    ['收藏','Favorites','お気に入り','즐겨찾기','收藏'],
    ['对策笔记','Matchup notes','対策ノート','매치업 노트','對策筆記'],
    ['设置','Settings','設定','설정','設定'],
    ['界面语言','Language','表示言語','표시 언어','介面語言'],
    ['强者不靠馈赠，全凭实力自证','Strength is earned.','強さは、自分で証明する。','실력으로 증명하라.','強者不靠饋贈，全憑實力自證'],
    ['未登录','Signed out','未ログイン','로그아웃 상태','未登入'],
    ['已登录','Signed in','ログイン中','로그인됨','已登入'],
    ['登录','Sign in','ログイン','로그인','登入'],
    ['退出','Sign out','ログアウト','로그아웃','登出'],
    ['外观','Appearance','外観','화면','外觀'],
    ['主题模式','Theme','テーマ','테마','主題模式'],
    ['选择亮色或暗色主题','Choose a theme','テーマを選択','테마 선택','選擇亮色或暗色主題'],
    ['暗色','Dark','ダーク','다크'],['亮色','Light','ライト','라이트'],
    ['布局密度','Density','表示密度','화면 밀도','版面密度'],
    ['选择宽松或紧凑的界面布局','Choose a layout density','表示密度を選択','화면 밀도 선택','選擇寬鬆或緊湊的介面佈局'],
    ['宽松','Spacious','ゆったり','여유롭게','寬鬆'],['紧凑','Compact','コンパクト','촘촘하게','緊湊'],
    ['数据','Data','データ','데이터','資料'],['清空缓存','Clear cache','キャッシュ削除','캐시 지우기','清除快取'],
    ['清除登录状态、搜索历史和角色缓存，保留收藏、备注和外观设置','Clear sign-in, searches and character cache. Keep favorites, notes and preferences.','ログイン・検索履歴・キャラキャッシュを削除。お気に入り・ノート・設定は保持。','로그인, 검색 기록, 캐릭터 캐시를 지웁니다. 즐겨찾기, 노트, 설정은 유지됩니다.','清除登入狀態、搜尋歷史和角色快取，保留收藏、備註和外觀設定'],
    ['清空','Clear','削除','지우기'],['确认清空？','Clear now?','削除しますか？','지울까요?','確認清除？'],['已清空','Cleared','削除しました','지워졌습니다','已清除'],
    ['关于','About','このアプリについて','정보','關於'],['版本','Version','バージョン','버전'],['源代码','Source code','ソースコード','소스 코드','原始碼'],
    ['在 GitHub 上查看本项目','View on GitHub','GitHubで見る','GitHub에서 보기','在 GitHub 上檢視本專案'],
    ['全部','All','すべて','전체'],['所有角色','All characters','全キャラクター','모든 캐릭터'],['全部角色','All characters','全キャラクター','모든 캐릭터'],
    ['全部对手','All opponents','全対戦相手','모든 상대','全部對手'],['选择角色','Select character','キャラクター選択','캐릭터 선택','選擇角色'],
    ['我的角色','My character','自分のキャラ','내 캐릭터'],['对手角色','Opponent character','相手キャラ','상대 캐릭터','對手角色'],
    ['选择对手','Select opponent','相手を選択','상대 선택','選擇對手'],['原有通用笔记','Legacy general notes','旧共通ノート','기존 공통 노트','原有通用筆記'],
    ['全球','Global','全世界','전 세계'],['地区选择','Select region','地域を選択','지역 선택','地區選擇'],
    ['地区','Region','地域','지역','地區'],['搜索地区','Search regions','地域を検索','지역 검색','搜尋地區'],
    ['暂无匹配地区','No matching regions','該当する地域なし','일치하는 지역 없음','暫無符合地區'],
    ['数据统计','Statistics','統計','통계','資料統計'],['刷新','Refresh','更新','새로고침'],['刷新当前视图数据','Refresh this view','現在のデータを更新','현재 화면 새로고침','重新整理目前檢視資料'],
    ['更新','Update','更新','업데이트'],['更新中…','Updating…','更新中…','업데이트 중…'],
    ['加载中…','Loading…','読み込み中…','불러오는 중…','載入中…'],['全力加载中...','Loading…','読み込み中…','불러오는 중…','全力載入中…'],
    ['正在加载排行榜...','Loading rankings…','ランキングを取得中…','랭킹 불러오는 중…','正在載入排行榜…'],
    ['正在统计前500名数据...','Analyzing the top 500…','上位500人を集計中…','상위 500명 집계 중…','正在統計前500名資料…'],
    ['暂无统计数据','No statistics yet','統計データなし','통계 없음','暫無統計資料'],
    ['暂无数据','No data','データなし','데이터 없음','暫無資料'],['暂无对战记录','No battles yet','対戦履歴なし','대전 기록 없음','暫無對戰紀錄'],
    ['暂无排位对局','No ranked battles','ランクマッチなし','랭크 매치 없음','暫無排名對局'],
    ['加载失败，请重试','Could not load. Try again.','取得できませんでした。再試行してください。','불러오지 못했습니다. 다시 시도하세요.','載入失敗，請重試'],
    ['重试','Retry','再試行','다시 시도','重試'],['取消','Cancel','キャンセル','취소'],['关闭','Close','閉じる','닫기','關閉'],
    ['搜索','Search','検索','검색','搜尋'],['足迹','Recent','履歴','최근 기록','足跡'],['按ID查询','Search by ID','IDで検索','ID로 검색','依ID查詢'],
    ['按昵称搜索','Search by name','名前で検索','닉네임 검색','依暱稱搜尋'],['输入玩家ID','Enter player ID','プレイヤーID','플레이어 ID 입력','輸入玩家ID'],
    ['输入玩家昵称','Enter player name','プレイヤー名','닉네임 입력','輸入玩家暱稱'],
    ['收藏玩家','Favorite players','お気に入りプレイヤー','즐겨찾는 플레이어'],['搜索历史','Search history','検索履歴','검색 기록','搜尋歷史'],
    ['清空历史','Clear history','履歴削除','기록 지우기','清除歷史'],['暂无收藏玩家','No favorite players','お気に入りなし','즐겨찾는 플레이어 없음','暫無收藏玩家'],
    ['暂无搜索记录','No recent searches','検索履歴なし','검색 기록 없음','暫無搜尋紀錄'],
    ['本地玩家','Saved player','保存済みプレイヤー','저장된 플레이어','本機玩家'],['历史玩家','Saved players','保存プレイヤー','저장된 플레이어','歷史玩家'],
    ['暂无保存的玩家','No saved players','保存プレイヤーなし','저장된 플레이어 없음','暫無儲存的玩家'],
    ['在线查询','Online search','オンライン検索','온라인 검색','線上查詢'],['查看本地数据','View saved data','保存データを見る','저장 데이터 보기','檢視本機資料'],
    ['排位赛','Ranked','ランクマッチ','랭크 매치','排名賽'],['休闲赛','Casual','カジュアルマッチ','캐주얼 매치','休閒賽'],
    ['比赛间对战','Custom room','カスタムルーム','커스텀 룸','比賽間對戰'],['格斗中心对战','Battle Hub','バトルハブ','배틀 허브','格鬥中心對戰'],
    ['角色对阵','Matchups','キャラ別対戦','캐릭터 매치업','角色對陣'],['训练分析','Training analysis','トレーニング分析','훈련 분석','訓練分析'],
    ['个人统计','Player stats','プレイヤー統計','개인 통계','個人統計'],['玩家信息','Player info','プレイヤー情報','플레이어 정보','玩家資訊'],
    ['展开详情','Show details','詳細を表示','상세 보기','展開詳情'],['收起详情','Hide details','詳細を隠す','상세 접기','收合詳情'],
    ['右键复制名称','Right-click to copy name','右クリックで名前をコピー','우클릭으로 이름 복사','右鍵複製名稱'],
    ['右键复制ID','Right-click to copy ID','右クリックでIDをコピー','우클릭으로 ID 복사','右鍵複製ID'],
    ['点击复制录像码','Copy replay ID','リプレイIDをコピー','리플레이 ID 복사','點擊複製重播碼'],
    ['对局备注','Battle note','対戦メモ','대전 메모','對局備註'],['添加对局备注','Add battle note','対戦メモを追加','대전 메모 추가','新增對局備註'],
    ['写下这场对局想记住的内容…','What would you like to remember?','この対戦で覚えておきたいこと…','이 대전에서 기억할 내용을 적어보세요…','寫下這場對局想記住的內容…'],
    ['在这里记录你的对策笔记…','Write your matchup notes here…','ここに対策を記録…','매치업 노트를 작성하세요…','在這裡記錄你的對策筆記…'],
    ['已保存','Saved','保存済み','저장됨','已儲存'],['自动保存到本机','Saved automatically on this device','この端末に自動保存','이 기기에 자동 저장','自動儲存至本機'],
    ['尚未保存，草稿仍在本页','Unsaved. Draft stays on this page.','未保存。このページに下書きがあります。','저장되지 않았습니다. 초안은 이 페이지에 있습니다.','尚未儲存，草稿仍在本頁'],
    ['重试保存','Retry saving','保存を再試行','저장 다시 시도','重試儲存'],['导入','Import','インポート','가져오기','匯入'],['导出','Export','エクスポート','내보내기','匯出'],
    ['删除','Delete','削除','삭제','刪除'],['笔记','Notes','ノート','노트','筆記'],['待复盘','To review','未確認','복기 대기','待復盤'],['已复盘','Reviewed','確認済み','복기 완료','已復盤'],
    ['对局数','Battles','対戦数','대전 수','對局數'],['场数','Battles','対戦数','대전 수','場數'],['胜率','Win rate','勝率','승률','勝率'],
    ['胜 / 负','W / L','勝 / 敗','승 / 패','勝 / 負'],['对手','Opponent','対戦相手','상대','對手'],['本人','You','自分','나'],
    ['高手','Elite','上位プレイヤー','상위 플레이어'],['高手参照','Elite reference','上位プレイヤー比較','상위 플레이어 비교','高手參照'],
    ['更新参照','Update reference','比較データを更新','비교 데이터 업데이트','更新參照'],['加载参照','Load reference','比較データを取得','비교 데이터 불러오기','載入參照'],
    ['同角色榜','Same-character ranking','同キャラランキング','동일 캐릭터 랭킹','同角色榜'],['前3名中位数','Top 3 median','上位3人の中央値','상위 3명 중앙값','前3名中位數'],
    ['榜首','Leader','1位','1위'],['账号近100战综合趋势','Account-wide trends: last 100 battles','アカウント全体・直近100戦','계정 전체 최근 100전 추세','帳號近100戰綜合趨勢'],
    ['指标','Metric','指標','지표','指標'],['差值','Difference','差','차이'],['优先练习','Practice first','優先練習','우선 연습','優先練習'],
    ['样本少','Small sample','少数サンプル','표본 부족','樣本少'],['局势表现','Situational results','状況別成績','상황별 성적','局勢表現'],
    ['标记','Tag','タグ','태그','標記'],['参考区间 ⓘ','Reference interval ⓘ','参考区間 ⓘ','참고 구간 ⓘ','參考區間 ⓘ'],
    ['今天','Today','今日','오늘'],['本赛季','This season','今シーズン','이번 시즌','本賽季'],['全部历史','All history','全履歴','전체 기록','全部歷史'],
    ['当前状态','Current form','現在の調子','현재 상태','目前狀態'],['个人最佳','Personal best','自己ベスト','개인 최고','個人最佳'],
    ['使用角色','Characters used','使用キャラクター','사용 캐릭터'],['期间首场→末场','First → last in period','期間の最初→最後','기간 내 처음→마지막','期間首場→末場'],
    ['按败局数排序','Sorted by losses','敗戦数順','패배 수 순','依敗局數排序'],['抽一场败局','Pick a loss','敗戦を1つ抽選','패배 한 경기 뽑기','抽一場敗局'],
    ['再抽一场','Pick another','もう1戦抽選','한 경기 더 뽑기','再抽一場'],['选一局，专心复盘','One battle. Focused review.','1戦をじっくり振り返る','한 경기에 집중해서 복기하세요','選一局，專心復盤'],
    ['暂无足够样本的短板对局','Not enough data for practice priorities','練習優先度を判断するデータが不足','연습 우선순위를 정할 표본이 부족합니다','暫無足夠樣本的弱勢對局'],
    ['数据口径与参考玩家','Method and reference players','集計方法と比較プレイヤー','집계 기준 및 비교 플레이어','資料口徑與參考玩家'],
    ['回看发生场景','Review the situation','該当場面を確認','해당 장면 확인','回看發生情境'],['仅按当前样本演算','Current sample only','現在のサンプルのみ','현재 표본 기준','僅依目前樣本演算'],
    ['斗气招架','Drive Parry','ドライブパリィ','드라이브 패리','鬥氣招架'],['斗气迸放','Drive Impact','ドライブインパクト','드라이브 임팩트','鬥氣迸放'],
    ['斗气爆发技','Overdrive','オーバードライブ','오버드라이브','鬥氣爆發技'],['招架斗气冲锋','Parry Drive Rush','パリィドライブラッシュ','패리 드라이브 러시','招架鬥氣衝鋒'],
    ['取消斗气冲锋','Cancel Drive Rush','キャンセルドライブラッシュ','캔슬 드라이브 러시','取消鬥氣衝鋒'],['斗气反攻','Drive Reversal','ドライブリバーサル','드라이브 리버설','鬥氣反攻'],
    ['伤害','Damage','ダメージ','대미지','傷害'],['终极必杀技','Critical Art','クリティカルアーツ','크리티컬 아츠','終極必殺技'],
    ['使用次数','Uses','使用回数','사용 횟수','使用次數'],['成功次数','Successes','成功回数','성공 횟수','成功次數'],['承受次数','Received','受けた回数','피격 횟수','承受次數'],
    ['拆投次数','Throw techs','投げ抜け回数','잡기 풀기 횟수','拆投次數'],['完美招架次数','Perfect parries','ジャストパリィ回数','퍼펙트 패리 횟수','完美招架次數'],
    ['将对手逼进版边的时间','Time cornering opponent','相手を画面端に追い込んだ時間','상대를 구석에 몬 시간','將對手逼進版邊的時間'],
    ['被对手逼进版边的时间','Time cornered','画面端に追い込まれた時間','구석에 몰린 시간','被對手逼進版邊的時間'],
    ['胜','Win','勝','승','勝'],['负','Loss','敗','패','負'],['平','Draw','引分','무','平'],
    ['好友','Friends','フレンド','친구'],['关注','Following','フォロー','팔로우','關注'],['关注者','Followers','フォロワー','팔로워','關注者'],
    ['在线','Online','オンライン','온라인','線上'],['离线','Offline','オフライン','오프라인','離線'],
    ['排名','Rank','順位','순위'],['角色','Character','キャラクター','캐릭터'],['玩家','Player','プレイヤー','플레이어'],
    ['角色使用率','Character usage','キャラ使用率','캐릭터 사용률'],['MR分布','MR distribution','MR分布','MR 분포'],
    ['平均MR','Average MR','平均MR','평균 MR'],['平均排名','Average rank','平均順位','평균 순위'],['最高MR','Highest MR','最高MR','최고 MR'],
    ['占比','Share','割合','비율','佔比'],['人数','Players','人数','인원'],['缓存','Cached','キャッシュ','캐시','快取'],['非强度榜','Not a tier list','強さの順位ではありません','티어 순위가 아닙니다','非強度榜'],
    ['更新时间未知','Update time unknown','更新日時不明','업데이트 시간 알 수 없음','更新時間未知'],
    ['春丽','Chun-Li','春麗','춘리','春麗'],['隆','Ryu','リュウ','류'],['卢克','Luke','ルーク','루크','路克'],['肯','Ken','ケン','켄'],
    ['嘉米','Cammy','キャミィ','캐미','嘉米'],['韩蛛俐','Juri','ジュリ','주리','韓蛛俐'],['豪鬼','Akuma','豪鬼','고우키'],
    ['金柏莉','Kimberly','キンバリー','킴벌리'],['曼侬','Manon','マノン','마농','曼儂'],['桑吉尔夫','Zangief','ザンギエフ','장기에프','桑吉爾夫'],
    ['达尔西姆','Dhalsim','ダルシム','달심','達爾西姆'],['迪 · 杰','Dee Jay','ディージェイ','디제이','迪 · 傑'],['莉莉','Lily','リリー','릴리'],
    ['拉希德','Rashid','ラシード','라시드'],['布兰卡','Blanka','ブランカ','블랑카','布蘭卡'],['玛丽莎','Marisa','マリーザ','마리사','瑪麗莎'],
    ['古烈','Guile','ガイル','가일'],['爱德','Ed','エド','에드','愛德'],['本田','E. Honda','エドモンド本田','에드몬드 혼다'],['杰米','Jamie','ジェイミー','제이미','傑米'],
    ['维加','M. Bison','ベガ','베가','維加'],['沙加特','Sagat','サガット','사가트'],['特瑞','Terry','テリー','테리'],['舞','Mai','舞','마이'],
    ['艾莲娜','Elena','エレナ','엘레나','艾蓮娜'],['毒蛇','C. Viper','C.ヴァイパー','C. 바이퍼'],['阿历克斯','Alex','アレックス','알렉스','阿歷克斯'],['英格丽德','Ingrid','イングリッド','잉그리드','英格麗德']
]);

addUiMessages([
    ['前往更新','Get update','更新ページへ','업데이트하기','前往更新'],
    ['胜负','Result','勝敗','승패','勝負'],['全部结果','All results','全結果','모든 결과','全部結果'],['胜局','Wins','勝ち','승리','勝局'],['负局','Losses','負け','패배','敗局'],
    ['开始日期','Start date','開始日','시작일','開始日期'],['结束日期','End date','終了日','종료일','結束日期'],['复盘','Review','振り返り','복기','復盤'],
    ['全部对局','All battles','全対戦','모든 대전','全部對局'],['重置筛选','Reset filters','絞り込み解除','필터 초기화','重設篩選'],
    ['未设置筛选条件','No filters','絞り込みなし','필터 없음','未設定篩選條件'],['筛选记录','Filtered battles','絞り込み件数','필터된 기록','篩選紀錄'],['筛选胜率','Filtered win rate','絞り込み勝率','필터된 승률','篩選勝率'],
    ['复制录像码','Copy replay ID','リプレイIDをコピー','리플레이 ID 복사','複製重播碼'],['继续加载历史','Load more history','履歴をさらに表示','기록 더 불러오기','繼續載入歷史'],
    ['练习时间','Practice time','トレーニング時間','연습 시간','練習時間'],['排位赛时间','Ranked play time','ランクマッチ時間','랭크 매치 시간','排名賽時間'],
    ['我的比赛间对战时间','My room play time','自分のルーム対戦時間','내 커스텀 룸 대전 시간','我的比賽間對戰時間'],
    ['挑战完成次数','Challenges completed','チャレンジ達成数','도전 완료 횟수','挑戰完成次數'],
    ['趋势（最近100场战斗）','Trends (last 100 battles)','傾向（直近100戦）','추세 (최근 100전)','趨勢（最近100場戰鬥）'],
    ['斗气槽使用率：过去平均100战','Drive gauge use: last 100 battles','ドライブ使用率：直近100戦','드라이브 게이지 사용률: 최근 100전','鬥氣槽使用率：過去平均100戰'],
    ['斗气反攻：过去平均100战','Drive Reversal: last 100 battles','ドライブリバーサル：直近100戦','드라이브 리버설: 최근 100전','鬥氣反攻：過去平均100戰'],
    ['斗气招架：过去平均100战','Drive Parry: last 100 battles','ドライブパリィ：直近100戦','드라이브 패리: 최근 100전','鬥氣招架：過去平均100戰'],
    ['摔投对手的斗气招架次数','Throws against Drive Parry','相手のパリィを投げた回数','상대 패리에 잡기 성공 횟수','摔投對手的鬥氣招架次數'],
    ['斗气招架被摔投次数','Throws received during Parry','パリィ中に投げられた回数','패리 중 잡힌 횟수','鬥氣招架被摔投次數'],
    ['斗气迸放：过去平均100战','Drive Impact: last 100 battles','ドライブインパクト：直近100戦','드라이브 임팩트: 최근 100전','鬥氣迸放：過去平均100戰'],
    ['[自行使用]','[Your use]','[自分の使用]','[내 사용]','[自行使用]'],['[对手使用]','[Opponent use]','[相手の使用]','[상대 사용]','[對手使用]'],
    ['确反康成功次数','Punish counters','パニッシュカウンター回数','퍼니시 카운터 횟수','確反康成功次數'],
    ['成功对上对手的斗气迸放次数','Countered Drive Impacts','インパクト返し成功回数','상대 임팩트 반격 횟수','成功對上對手的鬥氣迸放次數'],
    ['受到确反康次数','Punish counters received','被パニッシュカウンター回数','퍼니시 카운터 피격 횟수','受到確反康次數'],
    ['被对手的斗气迸放对上次数','Drive Impacts countered','インパクトを返された回数','임팩트 반격당한 횟수','被對手的鬥氣迸放對上次數'],
    ['超级必杀槽使用率：过去平均100战','Super gauge use: last 100 battles','SAゲージ使用率：直近100戦','슈퍼 게이지 사용률: 최근 100전','超級必殺槽使用率：過去平均100戰'],
    ['眩晕：过去平均100战','Stuns: last 100 battles','スタン：直近100戦','스턴: 최근 100전','暈眩：過去平均100戰'],
    ['让对手眩晕次数','Stuns inflicted','相手をスタンさせた回数','상대 스턴 횟수','讓對手暈眩次數'],['眩晕次数','Stuns received','スタンした回数','스턴당한 횟수','暈眩次數'],
    ['摔投：过去平均100战','Throws: last 100 battles','投げ：直近100戦','잡기: 최근 100전','摔投：過去平均100戰'],
    ['版边：过去平均100战','Corner time: last 100 battles','画面端：直近100戦','구석: 최근 100전','版邊：過去平均100戰'],
    ['排位赛对战次数','Ranked battles','ランクマッチ対戦数','랭크 매치 대전 수','排名賽對戰次數'],['休闲赛对战次数','Casual battles','カジュアル対戦数','캐주얼 매치 대전 수','休閒賽對戰次數'],
    ['比赛间对战次数','Custom room battles','ルーム対戦数','커스텀 룸 대전 수','比賽間對戰次數'],['比赛间对战次数（1vs1）','Custom room battles (1v1)','ルーム対戦数（1対1）','커스텀 룸 대전 수 (1대1)','比賽間對戰次數（1vs1）'],
    ['格斗中心对战次数','Battle Hub battles','バトルハブ対戦数','배틀 허브 대전 수','格鬥中心對戰次數'],['累计格斗点','Total Kudos','累計ファイティングポイント','누적 파이팅 포인트','累計格鬥點'],
    ['其他斗气操作','Other Drive use','その他のドライブ操作','기타 드라이브 조작','其他鬥氣操作'],['其他斗气使用率','Other Drive usage','その他のドライブ使用率','기타 드라이브 사용률','其他鬥氣使用率'],
    ['对战次数','Battles','対戦数','대전 횟수','對戰次數'],['胜场','Wins','勝利数','승리 수','勝場'],['刷 新','Refresh','更新','새로고침'],
    ['上一页','Previous','前へ','이전','上一頁'],['下一页','Next','次へ','다음','下一頁'],['趋势分析','Trend analysis','傾向分析','추세 분석','趨勢分析'],
    ['M阶分 (MR)','Master Rating (MR)','マスターレート (MR)','마스터 레이팅 (MR)','M階分 (MR)'],['积分 (LP)','League Points (LP)','リーグポイント (LP)','리그 포인트 (LP)','積分 (LP)'],
    ['时间：','Time:','日時：','시간:','時間：'],['对位：','Matchup:','対戦：','매치업:','對位：'],['结果：','Result:','結果：','결과:','結果：'],
    ['朋友','Friends','フレンド','친구'],['屏蔽','Blocked','ブロック','차단','封鎖'],['游戏模式','Game mode','ゲームモード','게임 모드','遊戲模式'],
    ['添加时间','Date added','追加日','추가일','新增時間'],['上次游戏日期','Last played','最終プレイ日','마지막 플레이','上次遊戲日期'],['段位','League','ランク','리그'],['降序','Descending','降順','내림차순'],['升序','Ascending','昇順','오름차순'],
    ['请先登录后查看战绩','Sign in to view battles','対戦履歴を見るにはログイン','대전 기록을 보려면 로그인하세요','請先登入後檢視戰績'],
    ['正在获取对战记录...','Fetching battle records…','対戦履歴を取得中…','대전 기록 가져오는 중…','正在取得對戰紀錄…'],
    ['用户登录','Sign in','ログイン','로그인','使用者登入'],['推荐：在平常使用的浏览器完成官网登录，再导入 Cookie。无需向应用提供账号密码。','Sign in on the official site in your usual browser, then import the Cookie. No password needed here.','普段のブラウザで公式サイトにログインし、Cookieを取り込んでください。パスワードの入力は不要です。','평소 브라우저에서 공식 사이트에 로그인한 뒤 Cookie를 가져오세요. 앱에 비밀번호를 입력할 필요가 없습니다.','建議：在平常使用的瀏覽器完成官網登入，再匯入 Cookie。無需向應用程式提供帳號密碼。'],
    ['打开默认浏览器访问官网','Open official site in browser','既定のブラウザで公式サイトを開く','기본 브라우저로 공식 사이트 열기','使用預設瀏覽器開啟官網'],['手动打开官网','Open official site manually','公式サイトを手動で開く','공식 사이트 직접 열기','手動開啟官網'],
    ['Cookie 导入','Import Cookie','Cookie取り込み','Cookie 가져오기','Cookie 匯入'],['官网 Cookie','Official-site Cookie','公式サイトのCookie','공식 사이트 Cookie','官網 Cookie'],['粘贴 Buckler 官网 Cookie 字符串…','Paste your Buckler Cookie…','BucklerのCookieを貼り付け…','Buckler Cookie 붙여넣기…','貼上 Buckler 官網 Cookie 字串…'],
    ['如何获取 Cookie','How to get the Cookie','Cookieの取得方法','Cookie 가져오는 방법','如何取得 Cookie'],
    ['在已登录的 Buckler 页面打开开发者工具 → Network，刷新页面并选择官网请求，在 Request Headers 中复制 Cookie 的值。不要复制 CAPCOM ID 密码、整个请求或响应。','On the signed-in Buckler page, open Developer Tools → Network. Reload, select an official request and copy its Cookie value from Request Headers. Do not copy your CAPCOM ID password or the entire request/response.','ログイン済みのBucklerで開発者ツール → Networkを開き、再読み込み。公式サイトへのリクエストのRequest HeadersからCookieの値をコピー。パスワードやリクエスト全体はコピーしないでください。','로그인된 Buckler에서 개발자 도구 → Network를 여세요. 새로고침 후 공식 요청의 Request Headers에서 Cookie 값만 복사하세요. CAPCOM ID 비밀번호나 요청/응답 전체를 복사하지 마세요.','在已登入的 Buckler 頁面開啟開發者工具 → Network，重新整理並選擇官網請求，在 Request Headers 中複製 Cookie 值。不要複製 CAPCOM ID 密碼或整個請求、回應。'],
    ['在此设备记住登录（Cookie 未加密，仅限私人电脑）','Remember on this device (unencrypted Cookie; private computers only)','ログインを記憶（Cookieは非暗号化・個人端末限定）','이 기기에서 로그인 유지 (Cookie 암호화 안 됨, 개인 PC 전용)','在此裝置記住登入（Cookie 未加密，僅限私人電腦）'],
    ['默认仅在本次会话保存。Cookie 是登录凭证，不要分享或截图。','Session-only by default. Cookies grant account access: do not share or screenshot them.','既定では今回のセッションのみ保存。Cookieは認証情報です。共有やスクリーンショットは避けてください。','기본적으로 현재 세션에만 저장됩니다. Cookie는 인증 정보이므로 공유하거나 캡처하지 마세요.','預設僅於本次工作階段儲存。Cookie 是登入憑證，不要分享或截圖。'],
    ['验证 Cookie 并登录','Verify Cookie and sign in','Cookieを検証してログイン','Cookie 확인 후 로그인','驗證 Cookie 並登入'],
    ['备用：Edge 自动读取 Cookie','Alternative: read Cookie from Edge','予備：EdgeからCookie取得','대체 방법: Edge에서 Cookie 읽기','備用：Edge 自動讀取 Cookie'],
    ['使用 WebDriver 临时窗口，可能遇到人机验证。需你手动完成；反复失败请用上方方式，不要连续重试。取消将关闭此临时窗口，不影响普通浏览器。','Uses a temporary WebDriver window. Complete any verification yourself. If it keeps failing, use Cookie import above. Cancel closes only this temporary window.','一時的なWebDriverウィンドウを使います。認証は手動で行ってください。失敗が続く場合は上のCookie取り込みを利用してください。キャンセルはこの一時ウィンドウのみ閉じます。','임시 WebDriver 창을 사용합니다. 인증은 직접 완료하세요. 계속 실패하면 위 Cookie 가져오기를 사용하세요. 취소하면 임시 창만 닫힙니다.','使用 WebDriver 暫時視窗，可能遇到人機驗證，需手動完成；反覆失敗請用上方方式。取消僅關閉此暫時視窗，不影響一般瀏覽器。'],
    ['打开临时 Edge 窗口','Open temporary Edge window','一時Edgeウィンドウを開く','임시 Edge 창 열기','開啟暫時 Edge 視窗'],
    ['完成登录并返回 Buckler 页面后，点击验证。窗口最长保留 10 分钟。','After signing in and returning to Buckler, verify below. The window stays open for up to 10 minutes.','ログインしてBucklerに戻ったら検証してください。ウィンドウは最長10分保持されます。','로그인 후 Buckler로 돌아와 확인하세요. 창은 최대 10분 동안 유지됩니다.','完成登入並返回 Buckler 後，點擊驗證。視窗最長保留 10 分鐘。'],['验证登录','Verify sign-in','ログインを検証','로그인 확인','驗證登入'],
    ['复盘对局 →','Review battles →','対戦を振り返る →','대전 복기 →','復盤對局 →'],['≥10场 · 胜率<50%','≥10 battles · win rate <50%','10戦以上・勝率50%未満','10전 이상 · 승률 50% 미만','≥10場 · 勝率<50%'],['目标胜率 50%','Target win rate: 50%','目標勝率50%','목표 승률 50%','目標勝率 50%'],
    ['角色对策笔记','Character matchup notes','キャラクター対策ノート','캐릭터 매치업 노트','角色對策筆記'],
    ['跳转','Go','移動','이동','跳轉'],['对照 MR','Compare MR','MRを比較','MR 비교','對照 MR'],['对照','Compare','比較','비교','對照'],['清除','Clear','解除','지우기','清除'],
    ['仅对照当前门槛，不预测名次','Current thresholds only; not a rank prediction','現在の基準値のみ・順位予測ではありません','현재 기준값만 비교하며 순위를 예측하지 않습니다','僅對照目前門檻，不預測名次'],
    ['参考 →','Reference →','参考 →','참고 →','參考 →'],['占比 / 条目','Share / entries','割合 / 件数','비율 / 항목','佔比 / 筆數'],['MR 中位 / 最高','MR median / max','MR中央値 / 最高','MR 중앙값 / 최고','MR 中位 / 最高'],
    ['头部占比差 ⓘ','Top share gap ⓘ','上位占有率の差 ⓘ','상위 점유율 차이 ⓘ','頭部佔比差 ⓘ'],['参考玩家','Reference players','比較プレイヤー','참고 플레이어','參考玩家'],['小样本','Small sample','少数サンプル','작은 표본','小樣本'],
    ['暂无该角色数据，可切换“全部角色”','No data for this character. Try All characters.','このキャラのデータなし。「全キャラクター」を選択してください。','해당 캐릭터 데이터가 없습니다. 모든 캐릭터를 선택하세요.','暫無該角色資料，可切換「全部角色」'],['暂无角色数据','No character data','キャラデータなし','캐릭터 데이터 없음','暫無角色資料'],['暂无有效MR','No valid MR data','有効なMRデータなし','유효한 MR 없음','暫無有效MR'],
    ['该时段暂无排位赛对局','No ranked battles in this period','この期間のランクマッチなし','해당 기간에 랭크 매치 없음','該時段暫無排名賽對局'],['好像什么都没有~','Nothing here yet','まだ何もありません','아직 아무것도 없어요','好像什麼都沒有～'],
    ['收藏对局','Favorite battles','お気に入り対戦','즐겨찾는 대전','收藏對局'],
    ['爬取设置','Collection settings','取得設定','수집 설정','擷取設定'],['爬取页数：','Pages:','取得ページ数：','수집 페이지 수:','擷取頁數：'],['并发线程数：','Workers:','同時取得数：','동시 작업 수:','並行執行緒數：'],['开始爬取','Start collecting','取得開始','수집 시작','開始擷取'],
    ['离线查看已保存的玩家资料与战绩','View saved profiles and battles offline','保存済みの情報・対戦履歴をオフライン表示','저장된 프로필과 대전 기록 오프라인 보기','離線檢視已儲存的玩家資料與戰績'],
    ['联网获取当前玩家的近期战绩与资料，合并保存到本地','Fetch recent battles and profile, then merge into local history','最新の情報と対戦履歴を取得してローカルに統合','최근 대전과 프로필을 가져와 로컬 기록에 병합','連線取得目前玩家的近期戰績與資料，合併儲存至本機']
]);

addUiMessages([
    ['经典','Classic','クラシック','클래식','經典'],['现代','Modern','モダン','모던','現代'],['动态','Dynamic','ダイナミック','다이내믹','動態'],
    ['已复制','Copied','コピー済み','복사됨','已複製'],['登录已过期','Session expired','ログイン期限切れ','로그인 만료','登入已過期'],['离线模式','Offline mode','オフラインモード','오프라인 모드','離線模式'],
    ['输入玩家名字','Enter player name','プレイヤー名を入力','플레이어 이름 입력','輸入玩家名稱'],['请输入玩家名字','Enter a player name','プレイヤー名を入力してください','플레이어 이름을 입력하세요','請輸入玩家名稱'],
    ['请输入玩家ID','Enter a player ID','プレイヤーIDを入力してください','플레이어 ID를 입력하세요','請輸入玩家ID'],['请先登录','Sign in first','先にログインしてください','먼저 로그인하세요','請先登入'],
    ['请先登录获取Cookie','Sign in with your Cookie first','先にCookieでログインしてください','먼저 Cookie로 로그인하세요','請先登入取得Cookie'],['请先登录后查看其他玩家战绩','Sign in to view another player’s battles','他のプレイヤーの履歴を見るにはログイン','다른 플레이어 기록을 보려면 로그인하세요','請先登入後檢視其他玩家戰績'],
    ['正在搜索玩家','Searching players','プレイヤー検索中','플레이어 검색 중','正在搜尋玩家'],['等待官网响应','Waiting for the official site','公式サイトの応答待ち','공식 사이트 응답 대기','等待官網回應'],
    ['正在连接','Connecting','接続中','연결 중','正在連線'],['正在加载','Loading','読み込み中','불러오는 중','正在載入'],['搜索超时，请重试','Search timed out. Try again.','検索がタイムアウトしました。再試行してください。','검색 시간이 초과되었습니다. 다시 시도하세요.','搜尋逾時，請重試'],
    ['登录失败，请重试','Sign-in failed. Try again.','ログイン失敗。再試行してください。','로그인 실패. 다시 시도하세요.','登入失敗，請重試'],['获取战绩失败，请重试','Could not fetch battles. Try again.','履歴取得失敗。再試行してください。','기록을 가져오지 못했습니다. 다시 시도하세요.','取得戰績失敗，請重試'],
    ['统计超时，请重试','Statistics timed out. Try again.','集計がタイムアウトしました。再試行してください。','통계 시간이 초과되었습니다. 다시 시도하세요.','統計逾時，請重試'],
    ['该玩家已在收藏列表中','Already in favorites','登録済みのプレイヤーです','이미 즐겨찾기에 있습니다','該玩家已在收藏清單中'],['已添加到收藏列表','Added to favorites','お気に入りに追加','즐겨찾기에 추가됨','已新增至收藏清單'],['已取消收藏','Removed from favorites','お気に入りを解除','즐겨찾기 해제됨','已取消收藏'],
    ['已添加到收藏列表，点击 ✏️ 按钮可添加备注','Added to favorites. Use ✏️ to add a remark.','お気に入りに追加。✏️でメモを追加できます。','즐겨찾기에 추가했습니다. ✏️로 메모를 추가하세요.','已新增至收藏清單，點擊 ✏️ 可新增備註'],
    ['已取消导出','Export cancelled','エクスポート中止','내보내기 취소됨','已取消匯出'],['已导出笔记','Notes exported','ノートをエクスポート済み','노트 내보내기 완료','已匯出筆記'],['导出失败，请重试','Export failed. Try again.','エクスポート失敗。再試行してください。','내보내기 실패. 다시 시도하세요.','匯出失敗，請重試'],
    ['读取本地历史超时，请重试','Local history timed out. Try again.','履歴読込がタイムアウトしました。再試行してください。','로컬 기록 시간이 초과되었습니다. 다시 시도하세요.','讀取本機歷史逾時，請重試'],
    ['更新需要联网登录；登录后再次点击“更新”。','Sign in online, then select Update again.','オンラインでログインしてから「更新」を押してください。','온라인 로그인 후 업데이트를 다시 누르세요.','更新需連線登入；登入後再次點擊「更新」。'],
    ['正在读取本地记录…','Reading local history…','ローカル履歴を読込中…','로컬 기록 읽는 중…','正在讀取本機紀錄…'],['暂无角色对阵数据，请刷新页面重新获取','No matchup data. Refresh to fetch again.','対戦データなし。更新してください。','매치업 데이터가 없습니다. 새로고침하세요.','暫無角色對陣資料，請重新整理頁面取得'],
    ['排位胜率','Ranked win rate','ランクマッチ勝率','랭크 승률','排名勝率'],['MR变化','MR change','MR変化','MR 변화','MR變化'],['LP变化','LP change','LP変化','LP 변화','LP變化'],
    ['首末赛前值差','First vs last pre-match value','最初と最後の対戦前の差','처음과 마지막 경기 전 수치 차이','首末賽前值差'],
    ['最近20场','Last 20 battles','直近20戦','최근 20전','最近20場'],['回合胜率','Round win rate','ラウンド勝率','라운드 승률','回合勝率'],
    ['风险观察','Risk watch','リスクの確認','위험 관찰','風險觀察'],['防守工具','Defense','防御','방어','防守工具'],['进攻工具','Offense','攻撃','공격','進攻工具'],['资源分配','Resource use','リソース配分','자원 사용','資源分配'],
    ['承受斗气迸放','Drive Impacts received','インパクト被弾','임팩트 피격','承受鬥氣迸放'],['招架被投','Throws during Parry','パリィ中の被投げ','패리 중 잡힘','招架被投'],
    ['承受摔投','Throws received','被投げ','잡기 당함'],['迸放确反康','Impact punish counters','インパクトのパニカン','임팩트 퍼니시 카운터','迸放確反康'],['被眩晕','Stunned','被スタン','스턴당함','被暈眩'],
    ['点击加载参照 · 不额外采集战绩','Load reference · no extra battle collection','比較データを取得・追加の履歴取得なし','비교 데이터 불러오기 · 대전 기록 추가 수집 없음','點擊載入參照 · 不額外擷取戰績'],
    ['逆风翻盘','Comeback','逆転勝ち','역전승','逆風翻盤'],['领先收尾','Closing a lead','先行後の勝利','리드 마무리','領先收尾'],
    ['挑战高分','Higher-rated opponents','高レートとの対戦','고레이팅 상대','挑戰高分'],['同分对局','Similar rating','近いレートとの対戦','비슷한 레이팅','同分對局'],['迎战低分','Lower-rated opponents','低レートとの対戦','저레이팅 상대','迎戰低分'],
    ['样本积累中','Building sample','サンプル蓄積中','표본 수집 중','樣本累積中'],['近期胜率回升','Recent improvement','最近の勝率上昇','최근 승률 상승','近期勝率回升'],['近期胜率回落','Recent decline','最近の勝率低下','최근 승률 하락','近期勝率回落'],
    ['主修','Main: ','メイン：','주력: ','主修'],['参照','Reference','比較','참고','參照'],['对','vs','対','대','對'],
    ['Master前','Master top ','Master上位','Master 상위 ','Master前'],['LP最高','Peak LP','最高LP','최고 LP','LP最高'],['最近约100局','Last ~100 battles','直近約100戦','최근 약 100전','最近約100局'],
    ['📌 仅统计排位赛 · 官方只保留当前赛季最近约100局','📌 Ranked only · official history keeps about 100 recent battles this season','📌 ランクマッチのみ・公式履歴は今季の直近約100戦','📌 랭크만 집계 · 공식 기록은 이번 시즌 최근 약 100전','📌 僅統計排名賽 · 官方僅保留本賽季最近約100局'],
    ['榜单最常见','Most common in sample','標本で最多','표본에서 가장 흔함','榜單最常見'],['前100占比更高','More represented in top 100','上位100で割合が高い','상위 100에서 비율 높음','前100佔比更高'],['较少见的上榜角色','Less common in sample','標本で少数のキャラ','표본에서 드문 캐릭터','較少見的上榜角色'],
    ['榜单记录','ranking entries','ランキング件数','랭킹 기록','榜單紀錄'],['条记录','entries','件','개 기록','筆紀錄'],['相较完整样本的占比差','Share gap vs full sample','全標本との割合差','전체 표본 대비 비율 차이','相較完整樣本的佔比差'],
    ['录像','Replay','リプレイ','리플레이','重播'],['查看','View ','表示：','보기: ','檢視'],['的参考玩家',' reference players','の比較プレイヤー',' 참고 플레이어','的參考玩家'],
    ['角色参考排序','Sort character references','キャラ比較の並び順','캐릭터 참고 정렬','角色參考排序'],['前100占比减完整样本占比；pp为百分点','Top 100 share minus full sample share; pp = percentage points','上位100割合−全標本割合（pp＝パーセントポイント）','상위 100 비율 - 전체 표본 비율 (pp = 퍼센트포인트)','前100佔比減完整樣本佔比；pp為百分點'],
    ['尚未加载。','Not loaded yet.','未取得。','아직 불러오지 않음.','尚未載入。'],['本人资料：','Your profile: ','自分の情報：','내 프로필: ','本人資料：'],
    ['高手来源：全球同角色榜前3名其他玩家，排除本人；每项按有效字段计算。','Reference: top 3 other players in the global same-character ranking. Each metric uses valid fields only.','比較対象：全世界同キャラ上位3人（自分を除く）。各項目は有効な値のみで計算。','비교 대상: 전 세계 동일 캐릭터 상위 3명 (본인 제외). 각 항목은 유효한 값으로만 계산합니다.','高手來源：全球同角色榜前3名其他玩家，排除本人；每項依有效欄位計算。'],
    ['仅统计本次返回的Master榜条目，同一玩家不同角色各占一条，不代表全服人口或角色强度。“头部”指官网标记前100的有效样本；占比差为头部减完整样本，pp为百分点。小样本不作强弱结论。MR对照仅使用实际读到的位次门槛，不能推算你的实际排名。未知地区不单独占板块。','Only returned Master ranking entries are counted; each player-character pair is separate. This is not the entire population or a strength ranking. Top share uses valid entries marked top 100; the gap is top share minus sample share, in percentage points. Small samples cannot establish strength. MR thresholds cannot predict your actual rank. Unknown regions are omitted.','取得したMasterランキングのみ集計。同一プレイヤーの別キャラは別件です。全体人口や強さを表すものではありません。上位は公式順位100位以内の有効標本。割合差は上位割合−全標本割合（pp）。少数標本から強弱は判断できません。MR基準値から実際の順位は予測できません。不明地域は省略。','반환된 Master 랭킹만 집계하며 동일 플레이어의 다른 캐릭터는 별도 항목입니다. 전체 인구나 캐릭터 강함을 뜻하지 않습니다. 상위는 공식 100위 이내 유효 표본이며 비율 차이는 상위 비율에서 전체 표본 비율을 뺀 퍼센트포인트입니다. 작은 표본으로 강약을 판단하지 않으며 MR 기준값으로 실제 순위를 예측할 수 없습니다. 불명 지역은 생략합니다.','僅統計本次回傳的Master榜項目，同一玩家不同角色各佔一筆，不代表全服人口或角色強度。「頭部」指官方標記前100的有效樣本；佔比差為頭部減完整樣本，pp為百分點。小樣本不作強弱結論。MR對照僅使用實際讀到的名次門檻，不能推算實際排名。未知地區不另佔版面。'],
    ['MR中位数','Median MR','MR中央値','MR 중앙값','MR中位數'],['头部占比差','Top share gap','上位占有率の差','상위 점유율 차이','頭部佔比差'],['出场占比','Usage share','使用割合','사용 비율','出場佔比'],
    ['榜单样本','Ranking sample','ランキング標本','랭킹 표본','榜單樣本'],['上榜MR范围','MR range','掲載MR範囲','랭킹 MR 범위','上榜MR範圍'],['角色集中度','Character concentration','キャラ集中度','캐릭터 집중도'],
    ['榜单门槛','Ranking thresholds','ランキング基準値','랭킹 기준값','榜單門檻'],['角色占比','Character share','キャラ割合','캐릭터 비율','角色佔比'],['按当前榜单样本','Current ranking sample','現在のランキング標本','현재 랭킹 표본 기준','依目前榜單樣本'],
    ['角色与参考玩家','Characters and references','キャラと比較プレイヤー','캐릭터 및 참고 플레이어','角色與參考玩家'],['更多数据与口径','More data and methodology','追加データと集計方法','추가 데이터 및 집계 기준','更多資料與口徑'],
    ['输入你的MR','Enter your MR','自分のMRを入力','내 MR 입력','輸入你的MR'],['正好持平','Equal','同じ値','동일'],['高出','Above','上回る','높음'],['还差','Below','不足','부족','還差'],
    ['请输入大于0的整数MR','Enter a positive whole-number MR','正の整数でMRを入力してください','0보다 큰 정수 MR을 입력하세요','請輸入大於0的整數MR'],['输入页码后回车或点跳转','Enter a page and press Enter or Go','ページ番号を入力してEnterまたは移動','페이지 입력 후 Enter 또는 이동','輸入頁碼後按Enter或點擊跳轉'],
    ['暂无排行榜数据','No ranking data','ランキングデータなし','랭킹 데이터 없음','暫無排行榜資料'],
    ['暂无朋友数据','No friends yet','フレンドなし','친구 없음','暫無朋友資料'],['暂无关注数据','Not following anyone','フォローなし','팔로우 없음','暫無關注資料'],['暂无屏蔽数据','No blocked players','ブロックなし','차단된 플레이어 없음','暫無封鎖資料'],
    ['收起','Collapse','折りたたむ','접기','收合'],['查看参考玩家','View reference players','比較プレイヤーを見る','참고 플레이어 보기','檢視參考玩家'],
    ['选择角色查看排行榜','Select a character to view rankings','キャラを選択してランキングを表示','캐릭터를 선택해 랭킹 보기','選擇角色檢視排行榜'],
    ['请先登录后查看排行榜','Sign in to view rankings','ランキングを見るにはログイン','랭킹을 보려면 로그인하세요','請先登入後檢視排行榜'],['请先登录后查看数据统计','Sign in to view statistics','統計を見るにはログイン','통계를 보려면 로그인하세요','請先登入後檢視資料統計'],
    ['每局结果（左：自己，右：对手）','Round results (you left, opponent right)','ラウンド結果（左：自分、右：相手）','라운드 결과 (왼쪽: 나, 오른쪽: 상대)','每局結果（左：自己，右：對手）'],
    ['补充缺少的笔记，不覆盖已有内容','Import missing notes without overwriting existing notes','未登録のノートのみ追加、既存内容は保持','기존 노트를 덮어쓰지 않고 없는 노트만 추가','補充缺少的筆記，不覆寫已有內容'],
    ['编辑备注','Edit remark','メモを編集','메모 편집','編輯備註'],['尚未保存：本地存储不可用或已满，草稿仍在本页，请重试','Unsaved: storage unavailable or full. Draft stays here; try again.','未保存：ストレージが使用不可または満杯です。下書きはこのページに残ります。','저장 공간을 사용할 수 없거나 가득 찼습니다. 초안은 이 페이지에 있습니다. 다시 시도하세요.','尚未儲存：本機儲存空間無法使用或已滿，草稿仍在本頁，請重試'],
    ['迪·杰','Dee Jay','ディージェイ','디제이','迪·傑'],['阿鬼','A.K.I.','A.K.I.','A.K.I.'],['埃德蒙·本田','E. Honda','エドモンド本田','에드몬드 혼다'],['艾琳娜','Elena','エレナ','엘레나'],['深红毒蛇','C. Viper','C.ヴァイパー','C. 바이퍼','深紅毒蛇'],['阿里克斯','Alex','アレックス','알렉스'],
    ['战绩仅统计已加载排位记录；平局与未知结果不计胜率。MR为同角色首末赛前值差，不含末场结算。高/低分对手以100 MR为界；参考区间为95% Wilson区间。','Only loaded ranked battles are counted; draws and unknown results are excluded from win rate. MR change uses first/last pre-match values for the same character, excluding the final settlement. Rating groups use a 100 MR gap. Intervals use 95% Wilson estimates.','取得済みランクマッチのみ集計。引分と不明結果は勝率から除外。MR変化は同キャラの最初と最後の対戦前の差で、最後の試合結果は含みません。レート帯は100 MR差で分類。区間は95% Wilson推定です。','불러온 랭크 기록만 집계하며 무승부와 불명 결과는 승률에서 제외합니다. MR 변화는 동일 캐릭터의 처음과 마지막 경기 전 값 차이로 마지막 경기 결과는 제외됩니다. 레이팅 구분 기준은 100 MR이며 구간은 95% Wilson 추정치입니다.','戰績僅統計已載入排名紀錄；平局與未知結果不計勝率。MR為同角色首末賽前值差，不含末場結算。高低分對手以100 MR為界；參考區間為95% Wilson區間。'],
    ['行为数据为官网账号近100战综合趋势，并非该角色独立数据。条形按单项缩放，仅比较同一行。资源占比不是成功率，差异不等于技术优劣或MR提升空间。无法确认的字段显示“—”。','Behavior metrics are account-wide trends from the last 100 battles, not character-specific. Compare within the same row only. Resource share is not success rate; differences do not measure skill or potential MR gain. Unavailable fields show —.','行動データはアカウント全体の直近100戦の傾向で、キャラ単独のデータではありません。棒は同じ行内でのみ比較してください。リソース割合は成功率ではなく、差は技量やMRの伸びしろを示しません。不明値は「—」。','행동 데이터는 계정 전체 최근 100전 추세이며 캐릭터별 데이터가 아닙니다. 막대는 같은 행에서만 비교하세요. 자원 비율은 성공률이 아니며 차이가 실력이나 MR 향상 가능성을 뜻하지 않습니다. 확인 불가 항목은 —로 표시됩니다.','行為資料為官網帳號近100戰綜合趨勢，並非該角色獨立資料。長條僅比較同一列。資源佔比不是成功率，差異不代表技術優劣或MR提升空間。無法確認的欄位顯示「—」。'],
    ['对空、连段失误、燃尽与起身防守需要录像确认，不从趋势值反推。','Anti-airs, dropped combos, burnout and wake-up defense require replay review; they cannot be inferred from trends.','対空・コンボミス・バーンアウト・起き上がりの守りはリプレイで確認してください。傾向値からは判断できません。','대공, 콤보 실수, 번아웃, 기상 방어는 리플레이로 확인해야 하며 추세값으로 추론하지 않습니다.','對空、連段失誤、燃盡與起身防守需以重播確認，不從趨勢值反推。']
]);

function uiText(value, language = uiLanguage) {
    if (typeof value !== 'string' || language === 'zh-CN') return value;
    const trimmed = value.trim();
    const direct = UI_MESSAGES.get(trimmed)?.[language];
    if (direct !== undefined) return value.replace(trimmed, direct);
    if (!/[\p{Script=Han}]/u.test(trimmed)) return value;
    for (const [pattern, messages] of UI_PATTERNS) {
        const match = trimmed.match(pattern);
        if (match) return value.replace(trimmed, messages[language].replace(/\$(\d)/g, (_, i) => match[Number(i)] || ''));
    }
    // Translate adjacent known labels (e.g. character A → character B), but do
    // not partially rewrite an unrecognized message or user-supplied content.
    const replacements = [];
    let remaining = value;
    for (const key of UI_PHRASES) {
        if (!remaining.includes(key)) continue;
        const token = `\u0001${replacements.length}\u0002`;
        replacements.push(UI_MESSAGES.get(key)[language]);
        remaining = remaining.split(key).join(token);
    }
    if (!/[\p{Script=Han}]/u.test(remaining)) return remaining.replace(/\u0001(\d+)\u0002/g, (_, i) => replacements[Number(i)]);
    return value;
}
let UI_PHRASES = [...UI_MESSAGES.keys()].sort((a,b)=>b.length-a.length);
const UI_PATTERNS = [
    [/^共 (\d+) 条对战记录（第 (\d+)\/(\d+) 页）$/, {en:'$1 battles (page $2/$3)',ja:'$1戦（$2/$3ページ）',ko:'$1전 ($2/$3 페이지)','zh-TW':'共 $1 筆對戰紀錄（第 $2/$3 頁）'}],
    [/^第(\d+)局$/, {en:'Round $1',ja:'第$1ラウンド',ko:'$1 라운드','zh-TW':'第$1局'}],
    [/^([\d.,]+)次$/, {en:'$1',ja:'$1回',ko:'$1회','zh-TW':'$1次'}],
    [/^([\d.,]+)秒$/, {en:'$1s',ja:'$1秒',ko:'$1초','zh-TW':'$1秒'}],
    [/^([\d.,]+)小时$/, {en:'$1h',ja:'$1時間',ko:'$1시간','zh-TW':'$1小時'}],
    [/^(\d+)点$/, {en:'$1',ja:'$1ポイント',ko:'$1 포인트','zh-TW':'$1點'}],
    [/^(\d+) 场 · (\d+) 负$/, {en:'$1 battles · $2 losses',ja:'$1戦・$2敗',ko:'$1전 · $2패','zh-TW':'$1 場 · $2 負'}],
    [/^约多赢 ([\d.]+) 场$/, {en:'About $1 more wins',ja:'約$1勝の上積み',ko:'약 $1승 추가','zh-TW':'約多贏 $1 場'}],
    [/^资料保存于 (.+)$/, {en:'Profile saved: $1',ja:'情報の保存日時：$1',ko:'프로필 저장: $1','zh-TW':'資料儲存於 $1'}],
    [/^共 (\d+) (?:名|条)$/, {en:'$1 entries',ja:'$1件',ko:'$1개','zh-TW':'共 $1 筆'}],
    [/^第\s*(\d+)\s*\/\s*(\d+)\s*页$/, {en:'Page $1 / $2',ja:'$1 / $2ページ',ko:'$1 / $2 페이지','zh-TW':'第 $1 / $2 頁'}],
    [/^第 (\d+) 页 \/ 共(\d+)页（共([\d,]+)人）$/, {en:'Page $1 / $2 ($3 players)',ja:'$1 / $2ページ（$3人）',ko:'$1 / $2 페이지 ($3명)','zh-TW':'第 $1 頁 / 共$2頁（共$3人）'}],
    [/^第 (\d+) 页（共([\d,]+)人）$/, {en:'Page $1 ($2 players)',ja:'$1ページ（$2人）',ko:'$1 페이지 ($2명)','zh-TW':'第 $1 頁（共$2人）'}],
    [/^第 (\d+) 页（本页(\d+)人）$/, {en:'Page $1 ($2 players on this page)',ja:'$1ページ（このページ$2人）',ko:'$1 페이지 (이 페이지 $2명)','zh-TW':'第 $1 頁（本頁$2人）'}],
    [/^([\d.,]+)\s*条$/, {en:'$1 entries',ja:'$1件',ko:'$1개','zh-TW':'$1 筆'}],
    [/^([\d.,]+)\s*场$/, {en:'$1 battles',ja:'$1戦',ko:'$1전','zh-TW':'$1 場'}],
    [/^(\d+) 场排位$/, {en:'$1 ranked battles',ja:'ランクマッチ$1戦',ko:'랭크 $1전','zh-TW':'$1 場排名賽'}],
    [/^(\d+) 个有效回合$/, {en:'$1 valid rounds',ja:'有効ラウンド$1',ko:'유효 라운드 $1개','zh-TW':'$1 個有效回合'}],
    [/^较前20场 (.+)$/, {en:'vs previous 20: $1',ja:'前の20戦比 $1',ko:'이전 20전 대비 $1','zh-TW':'較前20場 $1'}],
    [/^(\d+)连胜$/, {en:'$1-win streak',ja:'$1連勝',ko:'$1연승','zh-TW':'$1連勝'}],
    [/^(\d+)连败$/, {en:'$1-loss streak',ja:'$1連敗',ko:'$1연패','zh-TW':'$1連敗'}],
    [/^期间最佳连胜 (\d+)$/, {en:'Best streak: $1 wins',ja:'期間最高$1連勝',ko:'기간 최고 $1연승','zh-TW':'期間最佳連勝 $1'}],
    [/^(\d+)局 · 胜率 (.+)$/, {en:'$1 battles · $2 win rate',ja:'$1戦・勝率$2',ko:'$1전 · 승률 $2','zh-TW':'$1局 · 勝率 $2'}],
    [/^🕒 时段分布（高峰：(\d+)点）$/, {en:'🕒 Play times (peak: $1:00)',ja:'🕒 時間帯（ピーク：$1時）',ko:'🕒 시간대 (최고: $1시)','zh-TW':'🕒 時段分佈（高峰：$1點）'}],
    [/^全部 (\d+) 个角色$/, {en:'All $1 characters',ja:'全$1キャラクター',ko:'전체 $1 캐릭터','zh-TW':'全部 $1 個角色'}],
    [/^展开全部 (\d+) 个角色$/, {en:'Show all $1 characters',ja:'全$1キャラを表示',ko:'전체 $1 캐릭터 보기','zh-TW':'展開全部 $1 個角色'}],
    [/^(\d+)个角色$/, {en:'$1 characters',ja:'$1キャラ',ko:'$1 캐릭터','zh-TW':'$1個角色'}],
    [/^(\d+) 位玩家$/, {en:'$1 players',ja:'$1人',ko:'$1명','zh-TW':'$1 位玩家'}],
    [/^(\d+) 条有效MR$/, {en:'$1 valid MR entries',ja:'有効MR $1件',ko:'유효 MR $1개','zh-TW':'$1 筆有效MR'}],
    [/^(\d+) 条榜单记录$/, {en:'$1 ranking entries',ja:'ランキング$1件',ko:'랭킹 기록 $1개','zh-TW':'$1 筆榜單紀錄'}],
    [/^中间50% (.+)$/, {en:'Middle 50%: $1',ja:'中央50%：$1',ko:'중간 50%: $1','zh-TW':'中間50% $1'}],
    [/^前三角色 · 共(\d+)个角色$/, {en:'Top 3 share · $1 characters',ja:'上位3キャラ割合・全$1キャラ',ko:'상위 3 캐릭터 비율 · 총 $1 캐릭터','zh-TW':'前三角色 · 共$1個角色'}],
    [/^(\d+) \/ (\d+)角色 · 点击看参考$/, {en:'$1 / $2 characters · select for references',ja:'$1 / $2キャラ・選択で比較表示',ko:'$1 / $2 캐릭터 · 선택하여 참고 보기','zh-TW':'$1 / $2角色 · 點擊看參考'}],
    [/^另 (\d+) 位$/, {en:'$1 more',ja:'他$1人',ko:'$1명 더','zh-TW':'另 $1 位'}],
    [/^前100占比 (.+)$/, {en:'Top 100 share: $1',ja:'上位100割合 $1',ko:'상위 100 비율 $1','zh-TW':'前100佔比 $1'}],
    [/^正在更新战绩：已读取 (\d+)\/(\d+) 页(，玩家资料读取中)?；统计随数据更新。$/, {en:'Updating battles: $1/$2 pages. Statistics update as data arrives.',ja:'履歴更新中：$1/$2ページ。取得に合わせて統計を更新します。',ko:'대전 기록 업데이트: $1/$2 페이지. 데이터에 따라 통계를 갱신합니다.','zh-TW':'正在更新戰績：已讀取 $1/$2 頁；統計隨資料更新。'}],
    [/^正在联网更新：已读取 (\d+)\/(\d+) 页，已有本地记录仍可查看…$/, {en:'Updating online: $1/$2 pages. Saved battles are still available…',ja:'オンライン更新：$1/$2ページ。保存済み履歴は閲覧できます…',ko:'온라인 업데이트: $1/$2 페이지. 저장된 기록은 계속 볼 수 있습니다…','zh-TW':'正在連線更新：已讀取 $1/$2 頁，仍可檢視既有本機紀錄…'}],
    [/^已导入 (\d+) 条，跳过 (\d+) 条已有笔记$/, {en:'Imported $1 notes; skipped $2 existing notes',ja:'$1件を取り込み、既存$2件をスキップ',ko:'$1개 가져옴, 기존 노트 $2개 건너뜀','zh-TW':'已匯入 $1 筆，略過 $2 筆已有筆記'}]
];
const localizedNodes = new WeakMap();
const localizedAttributes = new WeakMap();
const UI_PRIVATE_CONTENT = 'script,style,textarea,[translate="no"],[contenteditable],.player-name,.profile-player-name,.match-player-name,.ranking-player-name,.ranking-card-title,.rstat-player-link,.favorite-name,.favorite-player-name,.user-id,.ranking-player-id,.profile-player-id,[id$="-summary"]';
function translateUi(root = document.body) {
    if (!root || !document.createTreeWalker) return;
    const translateNode = node => {
        if (!node.parentElement || node.parentElement.closest(UI_PRIVATE_CONTENT)) return;
        const previous = localizedNodes.get(node);
        const canonical = previous && node.nodeValue === previous.shown ? previous.canonical : node.nodeValue;
        const shown = uiText(canonical);
        if (node.nodeValue !== shown) node.nodeValue = shown;
        localizedNodes.set(node, {canonical, shown});
    };
    if (root.nodeType === 3) translateNode(root);
    else {
        const walker = document.createTreeWalker(root, 4);
        let node;
        while ((node = walker.nextNode())) translateNode(node);
    }
    const elements = root.nodeType === 1 ? [root, ...root.querySelectorAll('[title],[placeholder],[aria-label],img[alt]')] : [];
    for (const el of elements) {
        if (el.closest('script,style,[translate="no"]')) continue;
        const previous = localizedAttributes.get(el) || {};
        for (const attr of ['title','placeholder','aria-label','alt']) {
            if (!el.hasAttribute(attr)) continue;
            const current = el.getAttribute(attr), old = previous[attr];
            const canonical = old && current === old.shown ? old.canonical : current;
            const shown = uiText(canonical);
            if (shown !== current) el.setAttribute(attr, shown);
            previous[attr] = {canonical, shown};
        }
        localizedAttributes.set(el, previous);
    }
}
function resolveUiLanguage(locale) {
    const tag = typeof locale === 'string' ? locale.trim().replace(/_/g, '-').toLowerCase() : '';
    const parts = tag.split('-');
    if (parts[0] === 'zh') {
        if (parts.includes('hant')) return 'zh-TW';
        if (parts.includes('hans')) return 'zh-CN';
        return parts.some(part => ['tw', 'hk', 'mo'].includes(part)) ? 'zh-TW' : 'zh-CN';
    }
    return ['en', 'ja', 'ko'].includes(parts[0]) ? parts[0] : 'en';
}
function systemUiLanguage() {
    // WebView/browser exposes the host's preferred language without native permissions.
    if (typeof navigator === 'undefined') return 'en';
    return resolveUiLanguage(navigator.language || navigator.languages?.[0]);
}
function setLanguage(language, {persist = true} = {}) {
    if (!UI_LANGUAGES.includes(language)) return false;
    uiLanguage = language;
    if (persist) {
        try { localStorage.setItem('sf6_language', language); } catch (_) { /* UI still usable without storage. */ }
    }
    document.documentElement.lang = language;
    const select = document.getElementById('languageSelect');
    if (select) select.value = language;
    translateUi();
    // Locale-sensitive region labels are rendered from stable ISO codes, not translated back.
    document.querySelectorAll('[data-region-label]').forEach(el => { el.textContent = rankingRegionName(Number(el.dataset.regionLabel)); });
    if (document.getElementById('rankingRegionDialog')) renderRankingRegions();
    return true;
}
function initLanguage() {
    let saved;
    try { saved = localStorage.getItem('sf6_language'); } catch (_) { /* default */ }
    // Automatic detection must not be saved as an explicit user preference.
    setLanguage(UI_LANGUAGES.includes(saved) ? saved : systemUiLanguage(), {persist:false});
    if (typeof MutationObserver === 'undefined') return;
    let queued = false;
    const observer = new MutationObserver(() => {
        if (queued) return;
        queued = true;
        queueMicrotask(() => {
            observer.disconnect();
            try { translateUi(); } finally {
                queued = false;
                observer.observe(document.body, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['title','placeholder','aria-label','alt']});
            }
        });
    });
    observer.observe(document.body, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['title','placeholder','aria-label','alt']});
}
