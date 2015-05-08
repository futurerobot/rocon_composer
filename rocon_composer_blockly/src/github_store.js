
var _ = require('lodash'),
  Promise = require('bluebird'),
  glob = Promise.promisify(require('glob')),
  fs = Promise.promisifyAll(require('fs')),
  xml2js = Promise.promisifyAll(require('xml2js')),
  libxml = require('libxmljs'),
  vkbeautify = require('vkbeautify'),
  os = require('os'),
  exec = Promise.promisify(require('child_process').exec),
  Path = require('path'),
  yaml = require('js-yaml'),
  nodegit = require('nodegit'),
  request = require('superagent'),
  Settings = require('./model').Settings,
  mkdirp = require('mkdirp');

/* options
 *
 * repo_root
 * working_repo
 * base_repo
 * working_branch
 * github_token
 * signature_name (optional)
 * signature_email (optional)
 */
var GithubStore = function(options){

  this.options = options;


  this.remoteCallbacks = {
    certificateCheck: function() { return 1; },
    credentials: function() {
      return nodegit.Cred.userpassPlaintextNew(config.github_token, "x-oauth-basic");
    }
  };

};



GithubStore.prototype._inRepo = function(){
  var repo_root = this.options.repo_root;
  var that = this;
  var options = this.options
  console.log("tmp repo root", repo_root);

  var remoteCallbacks = this.remoteCallbacks;

  return nodegit.Repository.open(repo_root)
    .catch(function(e){
      var repo_url = "https://github.com/"+options.working_repo+".git";

      return nodegit.Clone(
        repo_url,
        repo_root,
        {remoteCallbacks: remoteCallbacks}).catch(function(e){
          logger.error('clone failed', e);


        })
        .then(function(repo){
           return nodegit.Remote.create(repo, "upstream",
                "https://github.com/"+config.service_repo_base+".git")
               .then(function(){
                 return repo;
               });
              
            })

    })
    .then(function(repo){
      var bra = options.working_branch;
      return repo.fetchAll(that.remoteCallbacks)
        .then(function(){
          console.log('merge ', bra);
          return repo.getBranchCommit('upstream/'+bra);
        })
        .then(function(commit){
          console.log(commit.sha());
          if(bra == "master"){
            return repo.mergeBranches("master", "upstream/master");
          }
          return repo.createBranch(bra, commit, 1, repo.defaultSignature(), "new branch");



          // return repo;
        }).then(function(){
          return repo;
          
        });



    });


};

GithubStore.prototype.createPullRequest = function(branch_name, title, description){
  var opt = this.options;

  return new Promise(function(resolve, reject){
    var head = opt.working_repo.split("/")[0] + ":" + branch_name;
    var data = {title: title, head: head, base: opt.working_branch, body: description}
    logger.info('PR : ', data);
    request.post('https://api.github.com/repos/' + opt.base_repo + "/pulls")
      .set('Authorization', "token "+opt.github_token) 
      .type('json')
      .send(data)
      .end(function(e, res){
        e ? reject(e) : resolve(res);
      });

  });

};

GithubStore.prototype.pushRepo = function(repo, ref){
  console.log(ref);
  console.log(ref+":"+ref);



  var that = this;
  return nodegit.Remote.lookup(repo, 'origin')
    .then(function(origin){
      origin.setCallbacks(that.remoteCallbacks);

      logger.info("origin", origin);
      return origin.push(
        [ref+":"+ref],
        null,
        repo.defaultSignature(),
        "Push");



    })
    .catch(function(e){
      logger.error('failed to push', e);
      
    });
};

GithubStore.prototype._createBranch = function(base, branch_name){
  return repo.getBranchCommit(base)
    .then(function(commit){
      return repo.createBranch(branch_name, commit);
    })

};

GithubStore.prototype.createBranch = function(repo){
  var new_branch_name = 'new-branch-'+(new Date().getTime());
  return this._createBranch(this.options.working_branch, new_branch_name);
};


GithubStore.prototype.addAllToIndex = function(repo){
  return repo.openIndex()
    .then(function(index){
      index.read(1)
      return index.addAll()
        .then(function(){
          index.write();
        })
        .then(function(){
          return index.writeTree();
        })
    });

};


GithubStore.prototype.commitRepo = function(repo, title, description){
  logger.info("commit", title, description)
  var that = this;
  var opts = this.options;
  // var index = null;

  that._createBranch(repo)
    .then(function(branch){

      repo.checkoutBranch(branch).then(function(){
        that._addAllToIndex(repo)
          .then(function(oid){
            return repo.getBranchCommit(config.service_repo_branch)
              .then(function(commit){
                logger.info(branch.toString());
                var author = nodegit.Signature.now(opts.signature_name, opts.signature_email);

                return repo.createCommit(branch.name(), author, author, 
                                         "updated "+(new Date()), 
                                         oid, [commit])

              })
              .then(function(){
                return that._pushRepo(repo, branch)
                  .then(function(){

                    return that._createPullRequest(branch.name().split("/")[2], title, description);

                  });

              });
            });

          })








        });

};

