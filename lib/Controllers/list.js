'use strict';

var util = require('util'),
    Base = require('./base'),
    _ = require('lodash'),
    errors = require('../Errors'),
    getKeys = require('../util').keys;

var List = function(args) {
  List.super_.call(this, args);
};

/**
 * Flag used to indicate that a filtering/search constraint ought to
 * be put into an OR group inside the where criteria.
 */
const OR_GROUP_PREFIX = "OR_GROUP_";

util.inherits(List, Base);

List.prototype.action = 'list';
List.prototype.method = 'get';
List.prototype.plurality = 'plural';

List.prototype._safeishParse = function(value, type, sequelize) {

  if (sequelize) {
    if (type instanceof sequelize.STRING || type instanceof sequelize.CHAR || type instanceof sequelize.TEXT) {
      if (!isNaN(value)) {
        return value;
      }
    } else if (type instanceof sequelize.INTEGER || type instanceof sequelize.BIGINT) {

    }
  }

  try {
    return JSON.parse(value);
  } catch(err) {
    return value;
  }
};

List.prototype.fetch = function(req, res, context) {
  var self = this,
      model = this.model,
      options = context.options || {},
      criteria = context.criteria || {},
      // clone the resource's default includes so we can modify them only for this request
      include = _.cloneDeepWith(this.include, value => {
        // ...but don't clone Sequelize models
        if (value.prototype && value.prototype.toString().includes('SequelizeInstance:'))
          return value;
      }),
      includeAttributes = this.includeAttributes,
      Sequelize = this.resource.sequelize,
      defaultCount = 100,
      count = +context.count || +req.query.count || defaultCount,
      offset = +context.offset || +req.query.offset || 0;

  var stringOperators = [
    Sequelize.Op.like, Sequelize.Op.iLike, Sequelize.Op.notLike, Sequelize.Op.notILike,
  ];

  // only look up attributes we care about
  options.attributes = options.attributes || this.resource.attributes;

  // account for offset and count
  offset += context.page * count || req.query.page * count || 0;
  if (count < 0) count = defaultCount;

  options.offset = offset;
  options.limit = count;
  if (!this.resource.pagination)
    delete options.limit;

  if (context.include && context.include.length) {
    include = include.concat(context.include);
  }
  if (include.length) {
    options.include = include;
  }


  //if shallow flag exists and is true, only "include" children that are in the 
  //optional "children" query param, and that were in our whitelist of potential includes
    if(context.shallow){
      let child_raw = req.query.children;
      if(!child_raw || typeof child_raw === "undefined" || typeof child_raw !== "string") {
      //if shallow, and no children requested, include none.
        delete options.include;
      } else {
        let children = child_raw.split("|");
        let cleaned_include = [];
        for(let i=0;i<options.include.length;i++) {
          let include = options.include[i];
          if(include.as && children.indexOf(include.as) !== -1)
          {
            cleaned_include.push(include);
          }
          else{
            //not a match, don't include.
          }
        }
        options.include = cleaned_include;
      }
    }
  


  var searchParams = this.resource.search.length ? this.resource.search : [this.resource.search];
  searchParams.forEach(function(searchData) {
    var searchParam = searchData.param;
    if (_.has(req.query, searchParam)) {
      var search = [];
      var searchOperator = searchData.operator || Sequelize.Op.like;
      var searchOverride = searchData.override || undefined;
      var searchAttributes =
        searchData.attributes || getKeys(model.rawAttributes);
      searchAttributes.forEach(function(attr) {
        if(stringOperators.indexOf(searchOperator) !== -1){
          var attrType = model.rawAttributes[attr].type;
          if (!(attrType instanceof Sequelize.STRING) &&
              !(attrType instanceof Sequelize.TEXT)) {
            // NOTE: Sequelize has added basic validation on types, so we can't get
            //       away with blind comparisons anymore. The feature is up for
            //       debate so this may be changed in the future
            return;
          }
        }

        var item = {};
        var query = {};
        var searchString;
        if (searchOperator !== Sequelize.Op.like) {
          searchString = req.query[searchParam];
        } else {
          searchString = '%' + req.query[searchParam] + '%';
        }
        if(searchOverride === "STARTS_WITH"){
          searchString = req.query[searchParam] + '%';
          searchOperator = Sequelize.Op.like;
        }
        

        query[searchOperator] = searchString;
        item[attr] = query;
        search.push(item);
        console.log("just pushed search item: ", item);
      });
      
      if (getKeys(criteria).length)
        criteria = Sequelize.and(criteria, Sequelize.or.apply(null, search));
      else
        criteria = Sequelize.or.apply(null, search);
    }
  });

  var sortParam = this.resource.sort.param;
  if (_.has(req.query, sortParam) || _.has(this.resource.sort, 'default')) {
    var order = [];
    var columnNames = [];
    var sortQuery = req.query[sortParam] || this.resource.sort.default || '';
    var sortColumns = sortQuery.split(',');
    sortColumns.forEach(function(sortColumn) {
      if (sortColumn.indexOf('-') === 0) {
        var actualName = sortColumn.substring(1);
        order.push([actualName, 'DESC']);
        columnNames.push(actualName);
      } else {
        columnNames.push(sortColumn);
        order.push([sortColumn, 'ASC']);
      }
    });
    var allowedColumns = this.resource.sort.attributes || getKeys(model.rawAttributes);
    var disallowedColumns = _.difference(columnNames, allowedColumns);
    if (disallowedColumns.length) {
      throw new errors.BadRequestError('Sorting not allowed on given attributes', disallowedColumns);
    }

    if (order.length)
      options.order = order;
  }

  // all other query parameters are passed to search
  var extraSearchCriteria = _.reduce(req.query, function(result, value, key) {
    if (_.has(model.rawAttributes, key)) result[key] = self._safeishParse(value, model.rawAttributes[key].type, Sequelize);
    //if key has or_group_prefix
    //define an empty or_list[]
    //substring off prefix from key to get actual field name
    //split values by comma to get array of values
    //look up model raw attributes type by field name and save to a variable
    //iterate over values and add them to an or_list[] as key value pairs
    //for each value run safeishParse
    //once done with the iteration, add an or group to the extraSearchCriteria whose list of conditions is or_list
    
    console.log("req.query, value, key, model", req.query, value, key, model )


    let or_group_flag = key.indexOf(OR_GROUP_PREFIX) === 0;
    let or_list = [];
    if(or_group_flag){
      
      

      let or_group_keys = [];
      or_group_keys.push[key];
      console.log("or group keys", or_group_keys);

      or_group_keys.forEach((key, i, a) =>{
        console.log("key, i, a", key, i, a);
        key_values = req.query[key];
        console.log("each key_values", key_values);
        
        key = key.substring(OR_GROUP_PREFIX.length);
        console.log("our key after or_group is removed", key);

        let value_arr = key_values.split(",");
        console.log("our array of values split by comma", value_arr);
        
        // let value_type = req.query[key].type;
        // console.log("our value type", value_type);

        value_arr.forEach(val => {
          var pair = {
            key: val
          };
          console.log("our key value pair", pair);
          or_list.push(pair);

          or_list[key] = or_list[key]._safeishParse(value, model.rawAttributes[key].type, Sequelize);

          
          console.log("our or_list after pair has been pushed", or_list);
        })
      })

    


    }

    if (or_list.length > 0){
      include.where = { [Sequelize.Op.or] : or_list};
    }else{
      return result;
    }

    
    //TODO MAKE NOTE TO TREAT OR_GROUP_ prefixed things differently.
    //IN ORDER TO HANDLE CORE FIELDS.

  }, {});

  if (getKeys(extraSearchCriteria).length)
    criteria = _.assign(criteria, extraSearchCriteria);
  
  // look for search parameters that reference properties on included models
  getKeys(req.query).forEach(key => {
    const path = key.split(".");

    //IDEA: hijack this. If the parameter begins with some
    //known  prefix like "OR_GROUP_" then, don't just add it to include
    //object as a simple fieldname: value thingie.
    //instead, put it into a GROUP that is OR. so...
    //i propose we support the following:
    // blah.com/api/books/?color=red&OR_GROUP_author_id=433&OR_GROUP_author_id=234
    // &OR_GROUP_tag_id=2343,234,234,5332,23234 (%2C encoded.)
    //so, we can just add extra get params with the SAME NAME, 
    //and 

    let includes = options.include;
    let currentModel = model;

    // books end point, param: Author.lit_agent_id=34
    //so, path becomes an array: ["Author","lit_agent_id"]
    //and we iterate through it until its length is ONE.
    //we immediately pop off or shift an "alias" which becomes.
    //so, after the SHIFT, 
    //alias = "Author"
    //and path = ["lit_agent_id"]
    //and prop = "lit_agent_id"
    //then we look inside our list of ALLOWED includes for the "alias" 
    //i.e. the relation name.  book has a hasOne relation to "Author" let's say.
    //if we find the allowed include (via this odd check for equaling string?)
    //we look up the assocation in our list of associations,
    //and we say, cool, we're going to add an include into our includes,
    //that basically JOINS IN the associated object, with its proper "as" 
    while (path.length > 1) {
      


      //choosing between say: OR_GROUP_Author.lit_agent_id vs Author.OR_GROUP_lit_agent_id
      //and I think we want the later.

      const alias = path.shift();
      var prop = path[0];

      //BCC 2020-03-18
      //are we dealing with something that wants to be or-grouped?
      let or_group_flag = prop.indexOf(OR_GROUP_PREFIX) === 0;
      if(or_group_flag) {
        //remove the or-group prefix part to restore sanity.
        prop = prop.substring(OR_GROUP_PREFIX.length);
      }

      let include = includes.find(i => i === alias || i.as === alias); // jshint ignore:line
      if (typeof include === "string") {
        // replace simple include definition with model-as syntax
        const association = currentModel.associations[alias];
        include = {
          model: association.target,
          as: association.options.as
        };
        includes.splice(includes.indexOf(alias), 1, include);
      }
      if (
        !include || 
        (path.length > 1 && !include.include) ||
        (path.length === 1 && !include.model && !_.has(include.model.rawAttributes, prop))
      ) return;
      currentModel = include.model;
      includes = include.include;
      if (path.length === 1) {        
        if(or_group_flag) {
          //instead of a simple property constraint
          let raw_value = req.query[key];
          if(!raw_value || raw_value.length === 0){
            //do nothing
          } else{
          let values = raw_value.split(",");
          if(!values || values.length <= 0) {
            //uhm, none. so do nothing.
          } else {
            //we have an array of strings that may or may not actually represent
            //numbers.  Let's assume they are numbers for now.
            //TODO review if string is needed.
            let constraint_group = {  };
            let or_list = [];
            //iterate or reduce or map our strings into ints and a bunch of foo_id = 323
            //value objects            
            _.forEach(values, function(value) {
              try {
              let number_val = parseInt(value);
                or_list.push({ [prop] : number_val });
              }
              catch(parse_error) {
                console.log("Trouble parsing int. SKIPPING THIS ONE. SQUASHING ERROR", value);
              }
            });

            // where: {
            //   [Op.or]: [{authorId: 12}, {authorId: 13}]
            // }
            if (or_list.length > 0){
            include.where = { [Sequelize.Op.or] : or_list};
            // include.where = { []}
            }
           
          }
        }

        } else {
          include.where = { [prop]: req.query[key] };
        }


      }
    }
  });

  // do the actual lookup
  if (getKeys(criteria).length)
    options.where = criteria;


    //BCC 20191203 BEGIN

if(context.extra_criteria) {
  var updated_where = _.assign({},options.where,context.extra_criteria);
  if(updated_where && updated_where != {}){
    options.where = updated_where;
  }
}
//BCC 20191203 END
    

  if (req.query.scope) {
    model = model.scope(req.query.scope);
  }

  //bug fix: Previously, counts with includes are higher than actual number of instances returned.
  //Adding distinct true as an option is the recommended fix from sequelize: https://github.com/sequelize/sequelize/issues/4042
  if(options.include && options.include.length > 0){
    options.distinct = true;
  }
 
  console.log("FINALE LIST OPTIONS where", options.where);


  console.log("FINALE LIST OPTIONS", options);

  if(options && options.include && options.include.length > 0 ){
    _.forEach(options.include, function(include) { 
      console.log("INCLUDE INFO",include );
    });
  }

  return model
    .findAndCountAll(options)
    .then(function(result) {
      context.instance = result.rows;
      var start = offset;
      var end = start + result.rows.length - 1;
      end = end === -1 ? 0 : end;

      if (self.resource.associationOptions.removeForeignKeys) {
        _.each(context.instance, function(instance) {
          _.each(includeAttributes, function(attr) {
            delete instance[attr];
            delete instance.dataValues[attr];
          });
        });
      }

      if (!!self.resource.pagination)
        res.header('Content-Range', 'items ' + [[start, end].join('-'), result.count].join('/'));

      return context.continue;
    });
};

module.exports = List;
