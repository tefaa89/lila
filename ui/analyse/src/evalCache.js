var m = require('mithril');
var throttle = require('common').throttle;
var defined = require('common').defined;
var isEvalBetter = require('ceval').isEvalBetter;

var evalPutMinDepth = 20;
var evalPutMinNodes = 3e6;
var evalPutMaxMoves = 10;

function qualityCheck(eval) {
  // below 500k nodes, the eval might come from an imminent threefold repetition
  // and should therefore be ignored
  return eval.nodes > 500000 && (
    eval.depth >= evalPutMinDepth || eval.nodes > evalPutMinNodes
  );
}

// from client eval to server eval
function toPutData(variant, eval) {
  var data = {
    fen: eval.fen,
    knodes: Math.round(eval.nodes / 1000),
    depth: eval.depth,
    pvs: eval.pvs.map(function(pv) {
      return {
        cp: pv.cp,
        mate: pv.mate,
        moves: pv.moves.slice(0, evalPutMaxMoves).join(' ')
      };
    })
  };
  if (variant !== 'standard') data.variant = variant;
  return data;
}

// from server eval to client eval
function toCeval(e) {
  var res = {
    fen: e.fen,
    nodes: e.knodes * 1000,
    depth: e.depth,
    pvs: e.pvs.map(function(from) {
      var to = {
        moves: from.moves.split(' ')
      };
      if (defined(from.cp)) to.cp = from.cp;
      else to.mate = from.mate;
      return to;
    }),
    cloud: true
  };
  if (defined(res.pvs[0].cp)) res.cp = res.pvs[0].cp;
  else res.mate = res.pvs[0].mate;
  res.cloud = true;
  return res;
}

module.exports = function(opts) {
  var fenFetched = [];
  var hasFetched = function(node) {
    return fenFetched.indexOf(node.fen) !== -1;
  };
  return {
    onCeval: throttle(500, false, function() {
      var node = opts.getNode();
      var eval = node.ceval;
      if (eval && !eval.cloud && hasFetched(node) && qualityCheck(eval) && opts.canPut(node)) {
        opts.send("evalPut", toPutData(opts.variant, eval));
      }
    }),
    fetch: function(path, multiPv) {
      var node = opts.getNode();
      if ((node.ceval && node.ceval.cloud) || !opts.canGet(node)) return;
      if (hasFetched(node)) return;
      fenFetched.push(node.fen);
      var obj = {
        fen: node.fen,
        path: path
      };
      if (opts.variant !== 'standard') obj.variant = opts.variant;
      if (multiPv > 1 || true) obj.mpv = multiPv;
      opts.send("evalGet", obj);
    },
    onCloudEval: function(serverEval) {
      opts.receive(toCeval(serverEval), serverEval.path);
    }
  };
};
