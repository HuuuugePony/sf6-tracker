// Offline localization tests; no browser, account or external service required.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function fixture(saved, navigator = {language:'zh-CN'}) {
    const storage = new Map(saved ? [['sf6_language',saved]] : []);
    const select = {value:''}, root = {lang:''};
    const context = vm.createContext({Intl, navigator,
        localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
        document:{body:{},documentElement:root,getElementById:id=>id==='languageSelect'?select:null,querySelectorAll:()=>[]},
    });
    for(const file of ['i18n.js','regions.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../web',file),'utf8'),context);
    return {run:code=>vm.runInContext(code,context),storage,select,root,context};
}
test('all five languages have complete catalog entries',()=>{
    const f=fixture();
    assert.equal(f.run('UI_LANGUAGES.length'),5);
    assert.equal(f.run("[...UI_MESSAGES.values()].every(row=>UI_LANGUAGES.every(lang=>typeof row[lang]==='string'&&row[lang].length>0))"),true);
    assert.equal(f.run("uiText('训练分析','en')"),'Training analysis');
    assert.equal(f.run("uiText('训练分析','ja')"),'トレーニング分析');
    assert.equal(f.run("uiText('训练分析','ko')"),'훈련 분석');
    assert.equal(f.run("uiText('训练分析','zh-TW')"),'訓練分析');
});
test('language persists and invalid preferences fall back safely',()=>{
    const f=fixture('ko');f.run('initLanguage()');
    assert.equal(f.root.lang,'ko');assert.equal(f.select.value,'ko');
    assert.equal(f.run("setLanguage('xx')"),false);assert.equal(f.root.lang,'ko');
    f.run("setLanguage('en');setLanguage('ja');setLanguage('zh-CN')");
    assert.equal(f.storage.get('sf6_language'),'zh-CN');
    const invalid=fixture('xx');invalid.run('initLanguage()');assert.equal(invalid.root.lang,'zh-CN');
});
test('first launch detects supported system language variants and falls back to English',()=>{
    const cases = [
        ['en-US','en'],['en-GB','en'],['ja-JP','ja'],['ko-KR','ko'],
        ['zh','zh-CN'],['zh-CN','zh-CN'],['zh-SG','zh-CN'],['zh-Hans','zh-CN'],
        ['zh-TW','zh-TW'],['zh-HK','zh-TW'],['zh-MO','zh-TW'],['zh-Hant','zh-TW'],
        ['zh-Hant-CN','zh-TW'],['zh-Hans-TW','zh-CN'],['ZH_hant_HK','zh-TW'],
        ['fr-FR','en'],['de-DE','en'],['','en'],[null,'en']
    ];
    for (const [language,expected] of cases) {
        const f=fixture(undefined,{language});f.run('initLanguage()');
        assert.equal(f.root.lang,expected,String(language));
        assert.equal(f.select.value,expected);
        assert.equal(f.storage.has('sf6_language'),false);
    }
});
test('automatic mode follows future system changes while manual choices stay preferred',()=>{
    const f=fixture(undefined,{language:'ja-JP'});f.run('initLanguage()');
    assert.equal(f.root.lang,'ja');
    f.context.navigator.language='ko-KR';f.run('initLanguage()');assert.equal(f.root.lang,'ko');
    f.run("setLanguage('zh-TW')");
    f.context.navigator.language='en-US';f.run('initLanguage()');assert.equal(f.root.lang,'zh-TW');
    const invalid=fixture('unknown',{language:'fr-FR'});invalid.run('initLanguage()');assert.equal(invalid.root.lang,'en');
    const secondary=fixture(undefined,{languages:['ja-JP']});secondary.run('initLanguage()');assert.equal(secondary.root.lang,'ja');
    const missing=fixture(undefined,undefined);missing.run('navigator=undefined;initLanguage()');assert.equal(missing.root.lang,'en');
});
test('labels, adjacent character names and dynamic counts localize without changing unknown text',()=>{
    const f=fixture();
    assert.equal(f.run("uiText('春丽 → 肯','en')"),'Chun-Li → Ken');
    assert.equal(f.run("uiText('共 130 条对战记录（第 1/13 页）','en')"),'130 battles (page 1/13)');
    assert.equal(f.run("uiText('0.5次','en')"),'0.5');
    assert.equal(f.run("uiText('0点','en')"),'0');
    assert.equal(f.run("uiText('未知的自定义文本','en')"),'未知的自定义文本');
    assert.equal(f.run("uiText('Player ABC / 1234','ja')"),'Player ABC / 1234');
});
test('DOM translation is reversible and never touches names, editable text or notes',()=>{
    const f=fixture();
    function node(text,privateContent=false){return {nodeType:3,nodeValue:text,parentElement:{closest:()=>privateContent?{}:null}};}
    const label=node('排行榜'),name=node('排行榜',true),note=node('春丽 → 肯',true);
    const nodes=[label,name,note];
    f.context.document.createTreeWalker=()=>{let i=0;return {nextNode:()=>nodes[i++]||null}};
    f.context.document.body={nodeType:1,querySelectorAll:()=>[],closest:()=>null,hasAttribute:()=>false};
    f.run("setLanguage('en')");assert.equal(label.nodeValue,'Rankings');assert.equal(name.nodeValue,'排行榜');assert.equal(note.nodeValue,'春丽 → 肯');
    f.run("setLanguage('ja');setLanguage('zh-CN')");assert.equal(label.nodeValue,'排行榜');
    label.nodeValue='训练分析';f.run("setLanguage('ko')");assert.equal(label.nodeValue,'훈련 분석');
    f.run("setLanguage('zh-CN')");assert.equal(label.nodeValue,'训练分析');
});
test('region catalog preserves the official flag IDs and full cache identity',()=>{
    const f=fixture();
    assert.equal(f.run('RANKING_REGIONS.length'),193);
    assert.equal(f.run('new Set(RANKING_REGIONS.map(r=>r.id)).size'),193);
    assert.equal(f.run('RANKING_REGIONS.some(r=>[169,999].includes(r.id))'),false);
    assert.equal(f.run("RANKING_REGIONS.find(r=>r.id===85).iso"),'JP');
    assert.equal(f.run("RANKING_REGIONS.find(r=>r.id===138).iso"),'KR');
    assert.notEqual(f.run('rankingRegionKey(3,85)'),f.run('rankingRegionKey(3,138)'));
    f.run("setLanguage('en')");assert.equal(f.run('rankingRegionName(85)'),'Japan');
    f.run("setLanguage('ko')");assert.equal(f.run('rankingRegionName(85)'),'일본');
});
