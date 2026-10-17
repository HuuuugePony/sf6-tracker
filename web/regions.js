// Official Buckler region flag list supplied by the user; checked 2026-10-17.
// https://www.streetfighter.com/6/buckler/zh-hans/ranking/league
// Flag IDs map to home_id, with home_filter=3 and home_category_id=7.
// Only listed options: neither missing ID 169 nor blank tile 999 is selectable.
const RANKING_REGIONS = [
    {"id":1,"name":"阿富汗","iso":"AF"},
    {"id":2,"name":"阿尔巴尼亚","iso":"AL"},
    {"id":3,"name":"阿尔及利亚","iso":"DZ"},
    {"id":4,"name":"安道尔","iso":"AD"},
    {"id":5,"name":"安哥拉","iso":"AO"},
    {"id":6,"name":"安提瓜和巴布达","iso":"AG"},
    {"id":7,"name":"阿根廷","iso":"AR"},
    {"id":8,"name":"亚美尼亚","iso":"AM"},
    {"id":9,"name":"澳大利亚","iso":"AU"},
    {"id":10,"name":"奥地利","iso":"AT"},
    {"id":11,"name":"阿塞拜疆","iso":"AZ"},
    {"id":12,"name":"巴哈马","iso":"BS"},
    {"id":13,"name":"巴林","iso":"BH"},
    {"id":14,"name":"孟加拉国","iso":"BD"},
    {"id":15,"name":"巴巴多斯","iso":"BB"},
    {"id":16,"name":"白俄罗斯","iso":"BY"},
    {"id":17,"name":"比利时","iso":"BE"},
    {"id":18,"name":"伯利兹","iso":"BZ"},
    {"id":19,"name":"贝宁","iso":"BJ"},
    {"id":20,"name":"不丹","iso":"BT"},
    {"id":21,"name":"玻利维亚","iso":"BO"},
    {"id":22,"name":"波斯尼亚和黑塞哥维那","iso":"BA"},
    {"id":23,"name":"博茨瓦纳","iso":"BW"},
    {"id":24,"name":"巴西","iso":"BR"},
    {"id":25,"name":"文莱","iso":"BN"},
    {"id":26,"name":"保加利亚","iso":"BG"},
    {"id":27,"name":"布基纳法索","iso":"BF"},
    {"id":28,"name":"布隆迪","iso":"BI"},
    {"id":29,"name":"佛得角","iso":"CV"},
    {"id":30,"name":"柬埔寨","iso":"KH"},
    {"id":31,"name":"喀麦隆","iso":"CM"},
    {"id":32,"name":"加拿大","iso":"CA"},
    {"id":33,"name":"中非","iso":"CF"},
    {"id":34,"name":"乍得","iso":"TD"},
    {"id":35,"name":"智利","iso":"CL"},
    {"id":36,"name":"中国","iso":"CN"},
    {"id":37,"name":"哥伦比亚","iso":"CO"},
    {"id":38,"name":"科摩罗","iso":"KM"},
    {"id":39,"name":"刚果共和国","iso":"CG"},
    {"id":40,"name":"哥斯达黎加","iso":"CR"},
    {"id":41,"name":"科特迪瓦","iso":"CI"},
    {"id":42,"name":"克罗地亚","iso":"HR"},
    {"id":43,"name":"古巴","iso":"CU"},
    {"id":44,"name":"塞浦路斯","iso":"CY"},
    {"id":45,"name":"捷克","iso":"CZ"},
    {"id":46,"name":"朝鲜","iso":"KP"},
    {"id":47,"name":"刚果民主共和国","iso":"CD"},
    {"id":48,"name":"丹麦","iso":"DK"},
    {"id":49,"name":"吉布提","iso":"DJ"},
    {"id":50,"name":"多米尼加","iso":"DM"},
    {"id":51,"name":"多米尼加共和国","iso":"DO"},
    {"id":52,"name":"厄瓜多尔","iso":"EC"},
    {"id":53,"name":"埃及","iso":"EG"},
    {"id":54,"name":"萨尔瓦多","iso":"SV"},
    {"id":55,"name":"赤道几内亚","iso":"GQ"},
    {"id":56,"name":"厄立特里亚","iso":"ER"},
    {"id":57,"name":"爱沙尼亚","iso":"EE"},
    {"id":58,"name":"埃塞俄比亚","iso":"ET"},
    {"id":59,"name":"斐济","iso":"FJ"},
    {"id":60,"name":"芬兰","iso":"FI"},
    {"id":61,"name":"法国","iso":"FR"},
    {"id":62,"name":"加蓬","iso":"GA"},
    {"id":63,"name":"冈比亚","iso":"GM"},
    {"id":64,"name":"格鲁吉亚","iso":"GE"},
    {"id":65,"name":"德国","iso":"DE"},
    {"id":66,"name":"加纳","iso":"GH"},
    {"id":67,"name":"希腊","iso":"GR"},
    {"id":68,"name":"格林纳达","iso":"GD"},
    {"id":69,"name":"危地马拉","iso":"GT"},
    {"id":70,"name":"几内亚","iso":"GN"},
    {"id":71,"name":"几内亚比绍","iso":"GW"},
    {"id":72,"name":"圭亚那","iso":"GY"},
    {"id":73,"name":"海地","iso":"HT"},
    {"id":74,"name":"洪都拉斯","iso":"HN"},
    {"id":75,"name":"匈牙利","iso":"HU"},
    {"id":76,"name":"冰岛","iso":"IS"},
    {"id":77,"name":"印度","iso":"IN"},
    {"id":78,"name":"印度尼西亚","iso":"ID"},
    {"id":79,"name":"伊朗","iso":"IR"},
    {"id":80,"name":"伊拉克","iso":"IQ"},
    {"id":81,"name":"爱尔兰","iso":"IE"},
    {"id":82,"name":"以色列","iso":"IL"},
    {"id":83,"name":"意大利","iso":"IT"},
    {"id":84,"name":"牙买加","iso":"JM"},
    {"id":85,"name":"日本","iso":"JP"},
    {"id":86,"name":"约旦","iso":"JO"},
    {"id":87,"name":"哈萨克斯坦","iso":"KZ"},
    {"id":88,"name":"肯尼亚","iso":"KE"},
    {"id":89,"name":"基里巴斯","iso":"KI"},
    {"id":90,"name":"科威特","iso":"KW"},
    {"id":91,"name":"吉尔吉斯斯坦","iso":"KG"},
    {"id":92,"name":"老挝","iso":"LA"},
    {"id":93,"name":"拉脱维亚","iso":"LV"},
    {"id":94,"name":"黎巴嫩","iso":"LB"},
    {"id":95,"name":"莱索托","iso":"LS"},
    {"id":96,"name":"利比里亚","iso":"LR"},
    {"id":97,"name":"利比亚","iso":"LY"},
    {"id":98,"name":"列支敦士登","iso":"LI"},
    {"id":99,"name":"立陶宛","iso":"LT"},
    {"id":100,"name":"卢森堡","iso":"LU"},
    {"id":101,"name":"马达加斯加","iso":"MG"},
    {"id":102,"name":"马拉维","iso":"MW"},
    {"id":103,"name":"马来西亚","iso":"MY"},
    {"id":104,"name":"马尔代夫","iso":"MV"},
    {"id":105,"name":"马里","iso":"ML"},
    {"id":106,"name":"马耳他","iso":"MT"},
    {"id":107,"name":"马绍尔群岛","iso":"MH"},
    {"id":108,"name":"毛里塔尼亚","iso":"MR"},
    {"id":109,"name":"毛里求斯","iso":"MU"},
    {"id":110,"name":"墨西哥","iso":"MX"},
    {"id":111,"name":"密克罗尼西亚","iso":"FM"},
    {"id":112,"name":"摩纳哥","iso":"MC"},
    {"id":113,"name":"蒙古","iso":"MN"},
    {"id":114,"name":"黑山","iso":"ME"},
    {"id":115,"name":"摩洛哥","iso":"MA"},
    {"id":116,"name":"莫桑比克","iso":"MZ"},
    {"id":117,"name":"缅甸","iso":"MM"},
    {"id":118,"name":"纳米比亚","iso":"NA"},
    {"id":119,"name":"瑙鲁","iso":"NR"},
    {"id":120,"name":"尼泊尔","iso":"NP"},
    {"id":121,"name":"荷兰","iso":"NL"},
    {"id":122,"name":"新西兰","iso":"NZ"},
    {"id":123,"name":"尼加拉瓜","iso":"NI"},
    {"id":124,"name":"尼日尔","iso":"NE"},
    {"id":125,"name":"尼日利亚","iso":"NG"},
    {"id":126,"name":"挪威","iso":"NO"},
    {"id":127,"name":"阿曼","iso":"OM"},
    {"id":128,"name":"巴基斯坦","iso":"PK"},
    {"id":129,"name":"帕劳","iso":"PW"},
    {"id":130,"name":"巴拿马","iso":"PA"},
    {"id":131,"name":"巴布亚新几内亚","iso":"PG"},
    {"id":132,"name":"巴拉圭","iso":"PY"},
    {"id":133,"name":"秘鲁","iso":"PE"},
    {"id":134,"name":"菲律宾","iso":"PH"},
    {"id":135,"name":"波兰","iso":"PL"},
    {"id":136,"name":"葡萄牙","iso":"PT"},
    {"id":137,"name":"卡塔尔","iso":"QA"},
    {"id":138,"name":"韩国","iso":"KR"},
    {"id":139,"name":"摩尔多瓦","iso":"MD"},
    {"id":140,"name":"罗马尼亚","iso":"RO"},
    {"id":141,"name":"俄罗斯","iso":"RU"},
    {"id":142,"name":"卢旺达","iso":"RW"},
    {"id":143,"name":"圣基茨和尼维斯","iso":"KN"},
    {"id":144,"name":"圣卢西亚","iso":"LC"},
    {"id":145,"name":"圣文森特和格林纳丁斯群岛","iso":"VC"},
    {"id":146,"name":"萨摩亚","iso":"WS"},
    {"id":147,"name":"圣马力诺","iso":"SM"},
    {"id":148,"name":"圣多美和普林西比","iso":"ST"},
    {"id":149,"name":"沙特阿拉伯","iso":"SA"},
    {"id":150,"name":"塞内加尔","iso":"SN"},
    {"id":151,"name":"塞尔维亚","iso":"RS"},
    {"id":152,"name":"塞舌尔","iso":"SC"},
    {"id":153,"name":"塞拉利昂","iso":"SL"},
    {"id":154,"name":"新加坡","iso":"SG"},
    {"id":155,"name":"斯洛伐克","iso":"SK"},
    {"id":156,"name":"斯洛文尼亚","iso":"SI"},
    {"id":157,"name":"所罗门群岛","iso":"SB"},
    {"id":158,"name":"索马里","iso":"SO"},
    {"id":159,"name":"南非","iso":"ZA"},
    {"id":160,"name":"南苏丹","iso":"SS"},
    {"id":161,"name":"西班牙","iso":"ES"},
    {"id":162,"name":"斯里兰卡","iso":"LK"},
    {"id":163,"name":"苏丹","iso":"SD"},
    {"id":164,"name":"苏里南","iso":"SR"},
    {"id":165,"name":"斯威士兰","iso":"SZ"},
    {"id":166,"name":"瑞典","iso":"SE"},
    {"id":167,"name":"瑞士","iso":"CH"},
    {"id":168,"name":"叙利亚","iso":"SY"},
    {"id":170,"name":"塔吉克斯坦","iso":"TJ"},
    {"id":171,"name":"泰国","iso":"TH"},
    {"id":172,"name":"马其顿","iso":"MK"},
    {"id":173,"name":"东帝汶","iso":"TL"},
    {"id":174,"name":"多哥","iso":"TG"},
    {"id":175,"name":"汤加","iso":"TO"},
    {"id":176,"name":"特立尼达和多巴哥","iso":"TT"},
    {"id":177,"name":"突尼斯","iso":"TN"},
    {"id":178,"name":"土耳其","iso":"TR"},
    {"id":179,"name":"土库曼斯坦","iso":"TM"},
    {"id":180,"name":"图瓦卢","iso":"TV"},
    {"id":181,"name":"乌干达","iso":"UG"},
    {"id":182,"name":"乌克兰","iso":"UA"},
    {"id":183,"name":"阿拉伯联合酋长国","iso":"AE"},
    {"id":184,"name":"英国","iso":"GB"},
    {"id":185,"name":"坦桑尼亚","iso":"TZ"},
    {"id":186,"name":"美国","iso":"US"},
    {"id":187,"name":"乌拉圭","iso":"UY"},
    {"id":188,"name":"乌兹别克斯坦","iso":"UZ"},
    {"id":189,"name":"瓦努阿图","iso":"VU"},
    {"id":190,"name":"委内瑞拉","iso":"VE"},
    {"id":191,"name":"越南","iso":"VN"},
    {"id":192,"name":"也门","iso":"YE"},
    {"id":193,"name":"赞比亚","iso":"ZM"},
    {"id":194,"name":"津巴布韦","iso":"ZW"},
];
// Use browser CLDR names for the same fixed ISO set in every UI language.
for (const region of RANKING_REGIONS) {
    const name = locale => {
        try { return new Intl.DisplayNames([locale], {type:'region'}).of(region.iso); }
        catch (_) { return region.name; }
    };
    addUiMessages([[region.name, name('en'), name('ja'), name('ko'), name('zh-TW')]]);
}
UI_PHRASES = [...UI_MESSAGES.keys()].sort((a,b)=>b.length-a.length);
function rankingRegionKey(filter, homeId = 0) { return filter === 3 ? '3:7:' + homeId : '1:0:0'; }
function rankingRegionName(id) {
    const region = RANKING_REGIONS.find(r => r.id === id);
    if (!region) return uiText('地区选择');
    if (uiLanguage === 'zh-CN') return region.name;
    try { return new Intl.DisplayNames([uiLanguage], {type:'region'}).of(region.iso); }
    catch (_) { return region.name; }
}
let rankingRegionTarget = false;
function rankingRegionLabel(id) {
    return `<span translate="no" data-region-label="${Number(id)}">${escapeHtml(rankingRegionName(id))}</span>`;
}
let rankingRegionFocus = null;
function openRankingRegionPicker(stats = false) {
    closeRankingRegionPicker();
    rankingRegionTarget = stats;
    rankingRegionFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.id = 'rankingRegionDialog';
    overlay.className = 'region-overlay';
    overlay.innerHTML = `<section class="region-dialog" role="dialog" aria-modal="true" aria-labelledby="regionDialogTitle">
        <div class="region-dialog-heading"><h3 id="regionDialogTitle">地区选择</h3><button type="button" class="report-more-btn" aria-label="关闭" onclick="closeRankingRegionPicker()">×</button></div>
        <input class="region-search" id="regionSearch" type="search" placeholder="搜索地区" aria-label="搜索地区" oninput="renderRankingRegions()">
        <div class="region-grid" id="rankingRegionGrid"></div></section>`;
    overlay.addEventListener('click', event => { if (event.target === overlay) closeRankingRegionPicker(); });
    overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); closeRankingRegionPicker(); }
        if (event.key !== 'Tab') return;
        const items = [...overlay.querySelectorAll('button,input')];
        const first=items[0], last=items[items.length-1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    document.body.appendChild(overlay);
    renderRankingRegions();
    translateUi(overlay);
    document.getElementById('regionSearch').focus();
}
function renderRankingRegions() {
    const grid = document.getElementById('rankingRegionGrid');
    if (!grid) return;
    const query = document.getElementById('regionSearch').value.trim().toLocaleLowerCase(uiLanguage);
    const selected = rankingRegionTarget ? rankingState.statsHomeId : rankingState.homeId;
    const rows = RANKING_REGIONS.filter(r => [r.name,rankingRegionName(r.id),r.iso].some(s=>s.toLocaleLowerCase(uiLanguage).includes(query)));
    grid.innerHTML = rows.map(r => `<button type="button" class="region-tile ${r.id === selected ? 'selected' : ''}" aria-pressed="${r.id === selected}" onclick="pickRankingRegion(${r.id})" title="${escapeHtml(rankingRegionName(r.id))}" translate="no">
        <img src="https://www.streetfighter.com/6/buckler/assets/images/material/national_frag/frag${String(r.id).padStart(3,'0')}.png" alt="" width="36" height="24" loading="lazy" onerror="this.style.visibility='hidden'">
        <span>${escapeHtml(rankingRegionName(r.id))}</span></button>`).join('') || `<div class="region-empty">${escapeHtml(uiText('暂无匹配地区'))}</div>`;
}
function pickRankingRegion(id) {
    if (!RANKING_REGIONS.some(r=>r.id === id)) return;
    if (rankingRegionTarget) changeStatsRegion(3,id);
    else changeRankingRegion(3,id);
    closeRankingRegionPicker();
}
function closeRankingRegionPicker() {
    const overlay = document.getElementById('rankingRegionDialog');
    if (!overlay) return;
    overlay.remove();
    if (rankingRegionFocus?.isConnected) rankingRegionFocus.focus();
    rankingRegionFocus = null;
}
