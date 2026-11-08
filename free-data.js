/* Public read-only endpoints documented by AKShare's official adapters.
   Never substitute daily turnover/price changes for an auction snapshot. */
const PUBLIC_SOURCES={
 lhb:'https://data.eastmoney.com/stock/tradedetail.html',
 streak:'https://quote.eastmoney.com/ztb/detail#type=ztgc',
 flow:'https://data.eastmoney.com/zjlx/detail.html'
};
function shanghaiDate(time=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));}
function publicNumber(value){return typeof value==='number'&&Number.isFinite(value)?value:null;}
function buildPublicUrl(kind,date,page=1){
 let base,params;
 if(kind==='lhb'){base='https://datacenter-web.eastmoney.com/api/data/v1/get';params={reportName:'RPT_DAILYBILLBOARD_DETAILSNEW',columns:'SECURITY_CODE,SECUCODE,SECURITY_NAME_ABBR,TRADE_DATE,BILLBOARD_NET_AMT,EXPLANATION',pageSize:'500',pageNumber:String(page),sortColumns:'SECURITY_CODE',sortTypes:'1',source:'WEB',client:'WEB',filter:`(TRADE_DATE='${date}')`};}
 else if(kind==='streak'){base='https://push2ex.eastmoney.com/getTopicZTPool';params={ut:'7eea3edcaed734bea9cbfc24409ed989',dpt:'wz.ztzt',Pageindex:'0',pagesize:'10000',sort:'lbc:desc',date:date.replaceAll('-','')};}
 else {base='https://push2.eastmoney.com/api/qt/clist/get';params={fid:'f62',po:'1',pz:'100',pn:String(page),np:'1',fltt:'2',invt:'2',ut:'b2884a393a59ad64002292a3e90d46a5',fs:'m:0+t:6+f:!2,m:0+t:13+f:!2,m:0+t:80+f:!2,m:1+t:2+f:!2,m:1+t:23+f:!2,m:0+t:7+f:!2,m:1+t:3+f:!2',fields:'f12,f14,f62,f124'};}
 return base+'?'+new URLSearchParams(params);
}
function normalizePublic(kind,json,date){
 if(kind==='lhb'){
  if(json.success===false)throw Error(json.message||'数据源返回失败');
  if(!json.result)return [];
  if(!Array.isArray(json.result.data))throw Error('龙虎榜响应格式已变化');
  return json.result.data.filter(r=>String(r.TRADE_DATE).slice(0,10)===date).map(r=>({code:r.SECURITY_CODE,name:r.SECURITY_NAME_ABBR,date,net:publicNumber(r.BILLBOARD_NET_AMT),reason:r.EXPLANATION}));
 }
 if(json.rc!==0)throw Error('数据源返回失败');
 if(!json.data)return [];
 if(kind==='streak'){
  if(String(json.data.qdate)!==date.replaceAll('-',''))throw Error('数据源返回日期不符，已拒绝混入');
  if(!Array.isArray(json.data.pool))throw Error('涨停池响应格式已变化');
  return json.data.pool.map(r=>({code:r.c,name:r.n,date,streak:publicNumber(r.lbc),cap:publicNumber(r.tshare),change:publicNumber(r.zdp),industry:r.hybk})).sort((a,b)=>(b.streak||0)-(a.streak||0));
 }
 if(!Array.isArray(json.data.diff))throw Error('资金流响应格式已变化');
 return json.data.diff.filter(r=>publicNumber(r.f124)!==null&&shanghaiDate(r.f124*1000)===date).map(r=>({code:r.f12,name:r.f14,date,net:publicNumber(r.f62),timestamp:r.f124}));
}
if(typeof module!=='undefined')module.exports={normalizePublic,buildPublicUrl,shanghaiDate};
if(typeof document!=='undefined'){
 const panel=document.createElement('section');panel.className='card';panel.style.margin='24px 0';panel.id='publicPanel';
 panel.innerHTML=`<div class="row"><div><h2>免费公开行情 <span class="tag">无需注册 · 手动刷新</span></h2><p class="hint">东方财富公开数据。用于复盘；不包含9:25竞价快照，不参与下方五条件筛选。</p></div><div class="tools"><input type="date" id="publicDate" aria-label="公开行情日期" style="width:160px"><button class="primary" id="loadPublic">读取免费行情</button></div></div><p class="hint">公开接口可能限流或延迟。龙虎榜盘后发布；资金流仅显示所选日期的最新前100名样本，不代表全市场。</p><div class="tabs" style="margin-top:18px"><button class="active" data-public="lhb">龙虎榜</button><button data-public="flow">资金流向</button><button data-public="streak">涨停与连板</button></div><div class="row"><span id="publicStatus" role="status" class="hint">点击读取，获取所选日期的数据。</span><div class="tools"><input id="publicSearch" placeholder="搜索股票" aria-label="搜索公开行情" style="width:150px"><button id="exportPublic">导出公开行情</button></div></div><div id="publicTable" class="scroll"><div class="empty">尚未读取公开行情</div></div><p class="hint" id="publicFoot"></p><p class="hint">完整竞价策略需要另外导入9:25快照。免费行情中缺失的竞价指标不会自动判为通过；“妖股概率”仍未估计。</p>`;
 document.querySelector('.layout').before(panel);
 const by=id=>document.getElementById(id);by('publicDate').value=shanghaiDate();by('publicDate').max=shanghaiDate();
 let selected='lhb',loadedDate=null,readAt=null,busy=false,states={};
 const fmt=v=>v===null?'—':(v/1e8).toFixed(2),td=v=>'<td>'+v+'</td>',safe=v=>esc(v);
 function drawPublic(){
  const s=states[selected];const titles={lhb:'龙虎榜',flow:'资金流向',streak:'涨停与连板'};
  by('publicStatus').textContent=s?`${titles[selected]} · ${loadedDate} · ${s.loading?'读取中…':s.error?'读取失败：'+s.error:'已读取 '+s.rows.length+' 条'}${readAt?' · 获取于 '+readAt:''}`:'点击读取，获取所选日期的数据。';
  const notes={lhb:'按上榜原因逐条展示；同一股票可能出现多条记录（含多日累计异动），净买额不跨原因相加。',flow:'主力净流入为数据源按订单大小分类的统计，不等于机构真实净买入。仅取最新净流入排名前100名，先按日期校验；历史日期无法通过此接口补取。',streak:'连板数为数据源在所选日的统计。盘中记录可能变化，不能当作前一交易日收盘连板数或前3个交易日涨停次数。市值为该行情快照总市值，不是9:25市值。'};
  by('publicFoot').innerHTML=notes[selected]+` <a href="${PUBLIC_SOURCES[selected]}" target="_blank" rel="noopener">打开原始页面 ↗</a>`;
  if(!s||s.loading){by('publicTable').innerHTML='<div class="empty">'+(s?'正在读取公开数据…':'尚未读取公开行情')+'</div>';return;}
  if(s.error){by('publicTable').innerHTML='<div class="empty">接口暂不可用，请稍后重试或打开原始页面查看。<br>失败不会被显示为零，也不会切换成演示数据。</div>';return;}
  const query=by('publicSearch').value.trim(),rs=s.rows.filter(r=>(r.code+' '+r.name).includes(query));
  if(!rs.length){by('publicTable').innerHTML='<div class="empty">'+(s.rows.length?'没有匹配的股票':selected==='flow'?'没有所选日期的资金记录；该接口仅提供最新数据，休市或历史日期可能无匹配。':'该日期暂无记录：可能未发布、非交易日或数据源未覆盖。')+'</div>';return;}
  const heads=selected==='lhb'?['股票','龙虎榜净买 / 亿','上榜原因']:selected==='flow'?['股票','主力净流入 / 亿','行情时间（上海）']:['股票','连板数','总市值 / 亿','当日涨幅 %','行业'];
  by('publicTable').innerHTML='<table><thead><tr>'+heads.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rs.map(r=>{const stock=`<strong>${safe(r.name)}</strong><div class="hint">${safe(r.code)}</div>`;const money=`<span class="${r.net>0?'red':r.net<0?'green':'muted'}">${fmt(r.net)}</span>`;const cols=selected==='lhb'?[stock,money,safe(r.reason)]:selected==='flow'?[stock,money,new Date(r.timestamp*1000).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})]:[stock,safe(r.streak),fmt(r.cap),r.change===null?'—':r.change.toFixed(2),safe(r.industry)];return '<tr>'+cols.map(td).join('')+'</tr>';}).join('')+'</tbody></table>';
 }
 async function fetchPublic(kind,date){
  async function get(page){const res=await fetch(buildPublicUrl(kind,date,page),{signal:AbortSignal.timeout(15000),credentials:'omit',referrerPolicy:'no-referrer'});if(!res.ok)throw Error('HTTP '+res.status);return res.json();}
  const first=await get(1);let rows=normalizePublic(kind,first,date);
  if(kind==='lhb'){const pages=first.result?.pages||1;if(pages>10)throw Error('龙虎榜记录超出预期，请查看原始页面');for(let p=2;p<=pages;p++)rows.push(...normalizePublic(kind,await get(p),date));}
  return rows;
 }
 by('loadPublic').onclick=async()=>{
  if(busy)return;const date=by('publicDate').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>shanghaiDate()){by('publicStatus').textContent='请选择今天或之前的日期';return;}
  busy=true;loadedDate=date;readAt=null;by('loadPublic').disabled=true;by('publicDate').disabled=true;states=Object.fromEntries(['lhb','flow','streak'].map(k=>[k,{loading:true,rows:[]}]));drawPublic();
  await Promise.allSettled(Object.keys(states).map(async kind=>{try{states[kind]={rows:await fetchPublic(kind,date)};}catch(e){states[kind]={rows:[],error:e.name==='TimeoutError'?'请求超时':e.message==='Failed to fetch'?'网络或跨域访问不可用':String(e.message)};}drawPublic();}));
  readAt=new Date().toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});busy=false;by('loadPublic').disabled=false;by('publicDate').disabled=false;drawPublic();
 };
 panel.querySelectorAll('[data-public]').forEach(b=>b.onclick=()=>{selected=b.dataset.public;panel.querySelectorAll('[data-public]').forEach(x=>x.classList.toggle('active',x===b));drawPublic();});by('publicSearch').oninput=drawPublic;
 by('exportPublic').onclick=()=>{if(!loadedDate||busy){by('publicStatus').textContent='请先等待免费行情读取完成';return;}download('公开行情复盘_'+loadedDate+'.json',JSON.stringify({date:loadedDate,source:'东方财富公开接口',purpose:'盘后或盘中复盘，非竞价筛选输入',retrievedAt:readAt,data:states,auctionAvailable:false},null,2),'application/json');};
}
