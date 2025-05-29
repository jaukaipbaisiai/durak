// worker.js -- Durak Monte Carlo and logic in web worker!
const SUITS = ['♠','♥','♦','♣'];
const RANKS = [9,10,11,12,13,14];
const RANK_LABELS = {9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A'};
function cardToString(card) { return RANK_LABELS[card.rank]+card.suit; }
function stringToCard(s) {
  let match = s.match(/^(\d+|J|Q|K|A)([♠♥♦♣])$/);
  let r = match[1], suit = match[2];
  let rank = (r==='J')?11 : (r==='Q')?12 : (r==='K')?13 : (r==='A')?14 : Number(r);
  return {rank,suit};
}
const ALL_CARDS = [];
for(let suit of SUITS) for(let rank of RANKS) ALL_CARDS.push({rank,suit});
onmessage = function(e) {
  if(e.data.type==='stats') {
    let {your, opp, trump, table, gone, ver} = e.data.state;
    let known = [].concat(your, trump, opp, table, gone);
    let knownSet = new Set(known);
    let unknownCards = ALL_CARDS.map(cardToString).filter(card=>!knownSet.has(card));
    let k = (opp.length===0 && your.length>0) ? 6 : (24-(your.length+trump.length+opp.length+table.length+gone.length));
    let probs = {};
    for(let c of opp) probs[c]=100;
    for(let c of unknownCards) probs[c]=0;
    let rest = unknownCards.filter(c=>probs[c]!==100);
    if(k>0 && rest.length>0) {
      let val = (100/rest.length).toFixed(1);
      for(let c of rest) probs[c]=val;
    }
    // Best attack:
    let bestA = null, bestAall = {};
    if (your.length>0) {
      for(let myCard of your) {
        let nWin=0, nTotal=0, nTrump=0;
        let samples= Math.min(100, Math.pow(unknownCards.length,k));
        for(let t=0;t<samples;t++) {
          let pool = unknownCards.slice(); shuffle(pool);
          let hand = pool.slice(0,k);
          let res = canOpponentDefend(myCard, hand.concat(opp), trump[0]);
          if(!res.can) nWin++;
          if(res.trump) nTrump++;
          nTotal++;
        }
        bestAall[myCard]={forceTake:(nWin/nTotal*100).toFixed(1),forceTrump:(nTrump/nTotal*100).toFixed(1)};
      }
      let best = your[0];
      for(let card of your) {
        if(Number(bestAall[card].forceTake)>Number(bestAall[best].forceTake) ||
          (bestAall[card].forceTake===bestAall[best].forceTake && Number(bestAall[card].forceTrump)>Number(bestAall[best].forceTrump)))
              best = card;
      }
      bestA = {card:best,all:bestAall};
    }
    // Best defense
    let bestD = null;
    let attCard = table[0];
    if(attCard && your.length>0) {
      let a = stringToCard(attCard);
      let trumpCard = trump[0]||'9♠', trumpSuit = trumpCard.slice(-1);
      let candidates = [];
      for(let cstr of your) {
        let c = stringToCard(cstr);
        if(c.suit===a.suit && c.rank>a.rank) candidates.push(cstr);
        if(c.suit===trumpSuit && a.suit!==trumpSuit) candidates.push(cstr);
      }
      if(candidates.length>0) {
        candidates.sort((a,b)=>{
          let ca=stringToCard(a), cb=stringToCard(b);
          if(ca.suit!==cb.suit) return ca.suit<cb.suit?-1:1;
          return ca.rank-cb.rank;
        });
        bestD = candidates[0];
      }
    }
    // Win probability
    let winp = 0, wins=0, runs=0;
    if(your.length>0) {
      for(let t=0;t<6;t++) {
        let pool = unknownCards.slice(); shuffle(pool);
        let hand = pool.slice(0,k).concat(opp), you = your.slice();
        let trumpCard = trump[0]||'9♠', trumpSuit = trumpCard.slice(-1);
        let res = simulateGreedy(you, hand, [], trumpSuit);
        if(res==='win') wins++;
        runs++;
      }
      winp = (wins/runs*100).toFixed(1);
    }
    postMessage({type:'stats',probs,unknownCards,bestA,bestD,winp,ver:e.data.ver});
  }
};
function shuffle(a) { for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} }
function canOpponentDefend(attCard, oppHand, trumpCard) {
  let a = stringToCard(attCard);
  let trump = trumpCard ? trumpCard.slice(-1) : '♠';
  let can=false,trumpUsed=false;
  for(let card of oppHand) {
    let c = stringToCard(card);
    if(c.suit===a.suit && c.rank>a.rank) can=true;
    if(c.suit===trump && a.suit!==trump) {can=true;trumpUsed=true;}
  }
  return {can,trump:trumpUsed};
}
function simulateGreedy(you, opp, deck, trump) {
  you=you.slice(); opp=opp.slice();
  let yourTurn=true;
  while(you.length && opp.length) {
    if(yourTurn) {
      let attack = you.slice().sort((a,b)=>{
        let ca=stringToCard(a),cb=stringToCard(b);
        if(ca.suit!==cb.suit) return ca.suit<cb.suit?-1:1; return ca.rank-cb.rank; })[0];
      you.splice(you.indexOf(attack),1);
      let canDef=false;
      for(let c of opp) {
        let cc=stringToCard(c), ac=stringToCard(attack);
        if(cc.suit===ac.suit&&cc.rank>ac.rank) {canDef=true; opp.splice(opp.indexOf(c),1); break;}
        if(cc.suit===trump&&ac.suit!==trump) {canDef=true; opp.splice(opp.indexOf(c),1); break;}
      }
      if(!canDef) opp.push(attack);
    } else {
      let attack = opp.slice().sort((a,b)=>{
        let ca=stringToCard(a),cb=stringToCard(b);
        if(ca.suit!==cb.suit) return ca.suit<cb.suit?-1:1; return ca.rank-cb.rank; })[0];
      opp.splice(opp.indexOf(attack),1);
      let canDef=false;
      for(let c of you) {
        let cc=stringToCard(c), ac=stringToCard(attack);
        if(cc.suit===ac.suit&&cc.rank>ac.rank) {canDef=true; you.splice(you.indexOf(c),1); break;}
        if(cc.suit===trump&&ac.suit!==trump) {canDef=true; you.splice(you.indexOf(c),1); break;}
      }
      if(!canDef) you.push(attack);
    }
    yourTurn=!yourTurn;
  }
  if(you.length===0) return 'win';
  if(opp.length===0) return 'lose';
  return 'draw';
}
