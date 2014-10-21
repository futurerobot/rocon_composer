var _ = require('lodash'),
  EventEmitter = require('events').EventEmitter,
  colors = require('colors'),
  bodyParser = require('body-parser'),
  express = require('express'),
  ROSLIB = require('roslib'),
  Fiber = require('fibers')
  Future = require('fibers/future'),
  wait = Future.wait,
  Utils = require('./utils'),
  util = require('util'),
  request = require('request');






/*
 * Engine class
 */

var Engine = function(db){
  this.db = db;
  this.ee = new EventEmitter();
  this.memory = {};
  var ros = this.ros = new ROSLIB.Ros();
  var engine = this;
  this.topics = [];
  var that = this;

  var retry_op = Utils.retry(function(){
    console.log('trying to connect to ros');

    var ros = that.ros = new ROSLIB.Ros();

    ros.on('error', function(e){
      console.log('ros error', e);
    });
    ros.on('connection', function(){
      console.log('ros connected');
      engine.emit('started');
      // ros.getMessageDetails('simple_delivery_msgs/DeliveryStatus', function(detail){
        // console.log('detail', detail);
      // });
      // ros.getMessageDetails('simple_delivery_msgs/DeliveryOrder', function(detail){
        // console.log('detail', detail);
      // });
      // ros.getTopics(function(topics){
        // console.log('topics : ', topics);
      // });
      // ros.getServices(function(topics){
        // // console.log('services : ', topics);
      // });

    });
    ros.on('close', function(){
      console.log('ros closed');
      retry_op.retry();
    });
    ros.connect(process.env.ROS_WS_URL);

  }, 0, 1000);

  _.defer(function(){
    // engine.emit('started');

  });

};
util.inherits(Engine, EventEmitter);


Engine.prototype.getMessageDetails = function(type, cb){
  request(process.env.MSG_DATABASE + "/api/message_details", {qs: {type: type}, json: true}, function(e, res, body){
    console.log("BODY", body, typeof body);

    
    cb(null, body);

  });
};

Engine.prototype.unsubscribe = function(topic){
  var t = _.remove(this.topics, {name: topic});
  t.listener.unsubscribe();
};
Engine.prototype.unsubscribeAll = function(){
  var engine = this;
  this.topics.forEach(function(t){
    t.listener.unsubscribe();
    engine.debug("topic "+t.name+" unsubscribed");

  });
  this.topics = [];
};

Engine.prototype.subscribe = function(topic, type){
  var engine = this;
  var listener = new ROSLIB.Topic({
    ros : this.ros,
    name : topic,
    messageType : type
  });

  listener.subscribe(function(message) {
    engine.debug('Received message on ' + listener.name + ': ' + message);
    engine.ee.emit(listener.name, message);

  });

  this.topics.push({name: topic, listener: listener});

};


Engine.prototype.pub = function(topic, type, msg){

  var topic = new ROSLIB.Topic({
    ros : this.ros,
    name : topic,
    messageType : type
  });

  var msg = new ROSLIB.Message(msg);


  // And finally, publish.
  topic.publish(msg);


};



Engine.prototype.sleep = function(ms){
  var _sleep = function(ms){
    var future = new Future;
    setTimeout(function(){
      future.return();
    }, ms);
    return future;
  };

  _sleep(ms).wait();

};
Engine.prototype.runService = function(name, type, request){
  var e = this;

  var _runService = function(name, type, request){
    var future = new Future;

    var service = new ROSLIB.Service({
     ros : e.ros,
     name : name,
     servicetype : type
    });


    var request = new ROSLIB.ServiceRequest(request);

    service.callService(request, function(result){
      console.log("XX", result);
      future.return(result);
    });
    return future;

  };
  return _runService(name, type, request).wait();
};

Engine.prototype.runCode = function(code){
  code = Utils.js_beautify(code);
  this.debug("---------------- scripts -----------------".grey);
  this.debug(_.map(code.split(/\n/), function(line){ return line.grey; }).join("\n"));
  this.debug("------------------------------------------".grey);
  eval(code);

};

Engine.prototype.runAction = function(name, type, goal, onResult, onFeedback){

  var ac = new ROSLIB.ActionClient({
    ros : this.ros,
    serverName : name,
    actionName : type
  });

  var goal = new ROSLIB.Goal({
    actionClient : ac,
    goalMessage : goal
  });

  goal.on('feedback', onFeedback);
  goal.on('result', onResult);

  goal.send();

};

Engine.prototype.cmdVel = function(options){
  console.log('cmdVel', options);

  var cmdVel = new ROSLIB.Topic({
    ros : this.ros,
    name : '/turtle1/cmd_vel',
    messageType : 'geometry_msgs/Twist'
  });

  var twist = new ROSLIB.Message(options);
  console.log(twist);

  cmdVel.publish(twist);


};


Engine.prototype.publish = function(event_name, params){
  var data = {event: event_name};
  _.assign(data, params);

};
Engine.prototype.clear = function(){
  this.ee.removeAllListeners();
  this.memory = {};
  this.unsubscribeAll();

  this.debug('engine cleared');

};
Engine.prototype.print = function(msg){
  console.log(msg.green);

};

Engine.prototype.log = function(args){
  console.log(args.green);
};

Engine.prototype.debug = function(args){
  console.log(args.grey);
};

Engine.prototype.itemsToCode = function(items){
  var js = _.map(items, function(i){
    return "// "+i.title+"\n"+i.js;
  }).join("\n\n");


  return ["Fiber(function(){", js, "}).run();"].join("\n");

};

Engine.prototype.runBlocks = function(blocks){
  var that = this;
  this.getItems(function(err, items){


    if(blocks && blocks.length > 0){
      items = _.where(items, function(i){
        return _.include(blocks, i.title);
      });
    }

    var scripts = that.itemsToCode(items);

    try{
      that.runCode(scripts);
      console.log("scripts evaluated.");
    }catch(e){
      console.log('invalid block scripts. failed.', e);
    }





  });

};

Engine.prototype.getItems = function(cb){
  var col = this.db.collection('settings');
  col.findOne({key: 'cento_authoring_items'}, function(e, data){

    var items = data ? data.value.data : [];
    cb(e, items);
  });

};


Engine.prototype.getParam = function(k, cb){
  var param = new ROSLIB.Param({
    ros : this.ros,
    name : k
  });
  param.get(cb)
};


Engine.prototype.setParam = function(k, v, cb){
  var paramClient = new ROSLIB.Service({
    ros : this.ros,
    name : '/rosapi/set_param',
    serviceType : 'rosapi/SetParam'
  });

  var request = new ROSLIB.ServiceRequest({
    name : k,
    value : JSON.stringify(v)
  });

  paramClient.callService(request, cb);
};

Engine.prototype.load = function(){
  this.runBlocks(null);

};
Engine.prototype.reload = function(){
  var that = this;
  this.clear();
  this.load();
};




module.exports = Engine;