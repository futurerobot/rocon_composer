var R = require('ramda')
  $ = require('jquery'),
  Utils = require('../utils'),
  schema = require('../schema/service_form');

var _interaction_to_json_editor_value = function(i){
  var kv = {
    _id: i._id, 
    display_name: i.defaults.display_name, 
    name: i.name,
    description: i.defaults.description,
    key: i.name,
    compatibility: i.compatibility,
    max: -1,
    role: 'Role', 

  };



  kv.remappings = _(i.interface)
    .values()
    .flatten()
    .map(function(if0){ return {remap_from: if0.name, remap_to: '/'+if0.name}; })
    .value();

    console.log("IF", i.interface);

  console.log(kv.remappings);


  if(i.parameters){
    kv.parameters = R.map(function(p){
      return {
        key: p.name, 
        value: (p.default || '')
      };
    })(i.parameters);
  }else{
    kv.parameters = [];
  }
  return kv;

};



module.exports = function($scope, blocksStore, $http, serviceAuthoring, $stateParams, $state) {
   $scope.select2Options = {
     allowClear:true
   };





   $scope.current = {interactions: [], parameters: []};

   $scope.addInteraction = function(){
     if(!$scope.current.interactions){
       $scope.current.interactions = [];
     }
     $scope.current.interactions.push({remappings: [], parameters: []});
   };

   $scope.addItem = function(lst, item){
     console.log(lst);
     lst.push(item);
   }
   $scope.deleteItem = function(lst, item){
     console.log(lst, item);

     _.pull(lst, item);
   }



   // $scope.blockConfigs = {};
   // $scope.currentBlockConfig = '';
   $scope.value = {};
   $scope.destPackage = null;

   blocksStore.getParam(ITEMS_PARAM_KEY).then(function(rows){
     blocksStore.loadInteractions().then(function(interactions){
       interactions = interactions.data;

       $scope.workflows = _.map(rows, function(row){ return {title: row.title, selected: false}; });
       // console.log(titles);
       // schema.properties.workflows.items.enum = titles;

       var form_v = $scope.current;
       if($stateParams.service_id){
         var s = _.find($scope.services, {id: $stateParams.service_id});
         form_v = s;

       }
       $scope.current = _.defaults(form_v, {parameters: [], interactions: []});



       var selected_workflows = 0;

       $scope.checksChanged = function(wf, selected){
         if(!selected) return;
         
         var rs = _.find(rows, {title: wf});
         var xml = rs.xml;
         var extras = $(xml).find('mutation[extra]').map(function(){
           var extra = $(this).attr('extra');  
           return JSON.parse(extra);
         }).toArray();

         client_app_names = _(extras).pluck('client_app_name').uniq().value();
         console.log(client_app_names);


         var used_interactions  = _.filter(interactions, function(it){
           return _.contains(client_app_names, it.name) && 
            !_.contains(_.pluck($scope.current.interactions, '_id'), it._id)
         });


         $scope.current.interactions = $scope.current.interactions.concat(
           _.map(used_interactions, _interaction_to_json_editor_value)
         );
       };



     });



   });





  serviceAuthoring.getPackages().then(function(packs){
    $scope.packageList = packs;
  });


  $scope.newPackage = function(){
    $scope.new_package = {};
    $('#modal-new-package').modal();

  };

  $scope.exportOk = function(){
    var destPackage = $scope.value.destPackage;


    var v = editor.getValue();
    var title = $scope.title;
    var description = $scope.description;

    serviceAuthoring.saveService(title, description, v, destPackage).then(function(){
      alert('saved');
      $('#modal-package-select').modal('hide');
      
    });

  };
  $scope.export = function(){
    serviceAuthoring.getPackages().then(function(packs){
      // $scope.packageList = packs;

      var v = editor.getValue();
      // serviceAuthoring.saveService(v);
      $scope.title = v.name;
      $scope.description = v.description;

      $('#modal-package-select').modal();

    });


  };
  $scope.save = function(){
    console.log('save');

    var v = $scope.current;

    console.log("save data : ", v);

    if(v.id){
      var s = _.find($scope.services, {id: v.id});
      _.assign(s, v);

    }else{
      v.id = Utils.uuid();
      v.created_at = new Date().getTime();
      $scope.services.push(v);
      $state.go('services_edit', {service_id: v.id});

      
    }
    


    // serviceAuthoring.saveService(v, $scope.destPackage[0].name).then(function(){
      // alert('saved');
      
    // });
    $('#modal-package-select').modal('hide');


  };


};
