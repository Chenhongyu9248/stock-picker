const finite=x=>typeof x==='number'&&Number.isFinite(x);
function assess(r,c){
 const checks=[['近3个交易日涨停',finite(r.limitCount3)?r.limitCount3>=1:null],['竞价换手率',finite(r.auctionTurnover)?r.auctionTurnover>c.turn:null],['竞价涨幅',finite(r.auctionChange)?r.auctionChange>c.change:null],['委卖量大于委买量',finite(r.askVolume)&&finite(r.bidVolume)?r.askVolume>r.bidVolume:null],['总市值',finite(r.marketCap)?r.marketCap<=c.cap:null]];
 const missing=checks.some(x=>x[1]===null);return {checks,status:missing?'数据不足':checks.every(x=>x[1])?'符合条件':'未通过'};
}
function score(r){
 if(![r.limitCount3,r.streak,r.auctionChange,r.auctionTurnover,r.marketCap].every(finite))return null;
 const parts=[['近3日涨停',Math.min(25,r.limitCount3*10)],['连续涨停',Math.min(25,r.streak*8)],['竞价涨幅',Math.min(20,Math.max(0,r.auctionChange)*2)],['竞价活跃度',Math.min(15,Math.max(0,r.auctionTurnover)*3)],['小市值特征',r.marketCap<=100?15:r.marketCap<=200?10:r.marketCap<=300?5:0]];
 return {value:Math.round(parts.reduce((a,b)=>a+b[1],0)),parts};
}
function validate(d){
 if(!d||!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||typeof d.source!=='string'||!d.source.trim()||!Array.isArray(d.stocks)||!Array.isArray(d.previousTradingDates)||d.previousTradingDates.length!==3)throw Error('需要 date、source、previousTradingDates（前3个交易日）和 stocks 数组');
 if(new Set(d.previousTradingDates).size!==3||d.previousTradingDates.some(x=>!/^\d{4}-\d{2}-\d{2}$/.test(x)||x>=d.date))throw Error('前3个交易日必须为不重复、早于选股日的日期');
 const seen=new Set();for(const r of d.stocks){if(typeof r.code!=='string'||!/^\d{6}\.(SH|SZ|BJ)$/.test(r.code)||typeof r.name!=='string'||seen.has(r.code))throw Error('股票代码需为000001.SZ格式且不可重复；name必填');seen.add(r.code);
 for(const k of ['limitCount3','streak','auctionTurnover','auctionChange','marketCap','askVolume','bidVolume','netFlow','lhbNet'])if(r[k]!=null&&!finite(r[k]))throw Error(r.code+' 的 '+k+' 必须是数值或null');
 for(const k of ['limitCount3','streak','auctionTurnover','marketCap','askVolume','bidVolume'])if(finite(r[k])&&r[k]<0)throw Error(k+'不可为负数');
 if(finite(r.limitCount3)&&(!Number.isInteger(r.limitCount3)||r.limitCount3>3))throw Error('limitCount3应为0至3整数');if(finite(r.streak)&&!Number.isInteger(r.streak))throw Error('streak应为整数');}
 return d;
}
if(typeof module!=='undefined')module.exports={assess,score,validate};
