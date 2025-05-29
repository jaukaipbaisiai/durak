// worker.js -- Durak logic for probabilities and win simulation in a web worker.
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
    let {your, opp, trump, table, gone} = e.data.state;
    let oppUnknownCount = e.data.oppUnknownCount;
    let known = [].concat(your, trump, opp, table, gone);
    let knownSet = new Set(known);
    let unknownCards = ALL_CARDS.map(cardToString).filter(card=>!knownSet.has(card));
    let k = oppUnknownCount; // always up to date
    let probs = {};
    for(let c of opp) probs[c]=100;
    for(let c of unknownCards) probs[c]=0;
    let rest = unknownCards.filter(c=>probs[c]!==100);
    if(k>0 && rest.length>0) {
      let val = (100/rest.length).toFixed(1);
      for(let c of rest) probs[c]=val;
    }
    // Win probability simulation:
    let winp = 0, wins=0, runs=0;
    if(your.length>0) {
      let nSamples = Math.min(180, Math.pow(unknownCards.length,k));
      for(let t=0;t<nSamples;t++) {
        let pool = unknownCards.slice(); shuffle(pool);
        let oppHand = pool.slice(0,k).concat(opp), you = your.slice();
        let trumpCard = trump[0]||'9♠', trumpSuit = trumpCard.slice(-1);
        let res = simulateGreedy(you, oppHand, [], trumpSuit);
        if(res==='win') wins++;
        runs++;
      }
      winp = (wins/runs*100).toFixed(1);
    }
    postMessage({type:'stats',probs,unknownCards,winp,ver:e.data.ver, oppUnknownCount: k});
  }
};
function shuffle(a) { for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} }
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
