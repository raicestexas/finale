'use strict';

var _ = require('lodash'),
    util = require('util'),
    Base = require('./base'),
    ReadController = require('./read'),
    getKeys = require('../util').keys;

var Update = function(args) {
  if (args.resource.updateMethod)
    this.method = args.resource.updateMethod;
  Update.super_.call(this, args);
};

util.inherits(Update, Base);

Update.prototype.action = 'update';
Update.prototype.method = 'put';
Update.prototype.plurality = 'singular';

Update.prototype.fetch = ReadController.prototype.fetch;

Update.prototype.write = function(req, res, context) {
  var instance = context.instance;
  context.attributes = _.defaults(context.attributes, req.body);

  this.endpoint.attributes.forEach(function(a) {
    if (req.params.hasOwnProperty(a))
      context.attributes[a] = req.params[a];
  });

  var self = this;

  //Supporting an add_to_children context variable that can allow
  //some values to be injected/added to all first level child object creations
  var add_to_children = context.add_to_children || {};
 var presentAses = [];

  // check associated data
  if (this.include && this.include.length) {
    _.values(self.resource.associationsInfo).forEach(function(association) {
      if (context.attributes.hasOwnProperty(association.as)) {
        var attr = context.attributes[association.as];
        presentAses.push(association.as);

        if(attr) {
           //add the add_to_children attributes to the attr 
           if(_.isArray(attr)){
            //if array, add the add_to_children to each object
            for(var x=0;x<attr.length;x++) {
              attr[x] = Object.assign(attr[x],add_to_children);
            }
            context.attributes[association.as] = attr;
          } else {
            attr = Object.assign(attr,add_to_children);
            context.attributes[association.as] = attr;
          }

          console.log("Did it, did something with add to children", context.attributes[association.as] , context.add_to_children);

        } else {
          // console.log("TEMP  no attr:", context.attributes, association, attr);

        }

        if (_.isObject(attr) && attr.hasOwnProperty(association.primaryKey)) {
          context.attributes[association.identifier] = attr[association.primaryKey];
        } else if(context.attributes.hasOwnProperty(association.as) && attr === null) {
          context.attributes[association.identifier] = null;
        }
      } else {
        // console.log("TEMP this context.attributes doesn't have association:", context.attributes, association);
      }
    });
  } else {
    // console.log("TEMP this include", this.include);
  }

  //var attribuetsDeepClone = _.cloneDeep(context.attributes);


  instance.set(context.attributes);

  //attempt here to force this thing to save a nested object change.
  //the latest version of sequelize seems overl
  presentAses.forEach(as => { 
    if(Array.isArray(instance.dataValues[as]))
    {
      instance.set(as,_.cloneDeep(instance.dataValues[as].slice()));
      instance.changed(as,true);
    } else {
      console.log("not an array");
    }
  });
  console.log("post as-change-flag changed" , instance.changed(), instance._changed);

  var myKeys = Object.keys(instance.dataValues);
  if(myKeys && myKeys.length) {
    var firstKey = myKeys[0];
    instance.changed(firstKey,true);
    console.log("just did a changed");
    console.log("force changed flag status" , instance.changed());
  }

  //due to how changed() is different now, we're going to force reload no matter what
  // https://sequelize.org/master/manual/upgrade-to-v6.html

  // check if reload is needed
  // var reloadAfter = self.resource.reloadInstances &&
  //   getKeys(self.resource.associationsInfo).some(function(attr) {
  //     return instance._changed.hasOwnProperty(attr);
  //   });

    var reloadAfter = true;
console.log("Attributes pre update save, stringify of instance.dataValues ", JSON.stringify(instance.dataValues));

  return instance
    .save()
    .then(function(instance) {
      if (reloadAfter) {
        var reloadOptions = {};
        if (Array.isArray(self.include) && self.include.length)
          reloadOptions.include=self.include;
        if (!!self.resource.excludeAttributes)
          reloadOptions.attributes = {exclude: self.resource.excludeAttributes };   
        if(context.shallow) {
          console.log("DELETING RELOAD OPTIONS in UPDATE DUE TO SHALLOW false.");
          console.log("RELOAD OPTIONS in UPDATE right before we delete the includes due to shallow being false",reloadOptions);

          delete reloadOptions.include;            
        }
        console.log("gonnan reload, with these options ", reloadOptions);
        return instance.reload(reloadOptions);
      } else {
       console.log("not reloading object... getKeys(self.resource.associationsInfo): ", getKeys(self.resource.associationsInfo), instance._changed);
        return instance;
      }
    }).then(function (instance) { 
      if (!!self.resource.excludeAttributes) {
        self.resource.excludeAttributes.forEach(function(attr) {
          delete instance.dataValues[attr];
        });
      }
      return instance;
    })
    .then(function(instance) {
      if (self.resource.associationOptions.removeForeignKeys) {
        _.values(self.resource.associationsInfo).forEach(function(info) {
          delete instance.dataValues[info.identifier];
        });
      }

      context.instance = instance;
      return context.continue;
    });
};

module.exports = Update;
