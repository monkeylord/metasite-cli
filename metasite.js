#!/usr/bin/env node

var program = require('commander')
var Hammer = require('metasite-hammer')
var Loader = require('metasite-loader')
var inquirer = require('inquirer')
var fs = require('fs')
var JSEncrypt = require('node-jsencrypt')
var bsv = require('bsv')
var datapay = require('datapay')
var crypto = require('crypto')
var open = require("open")

program
    .command('init')
    .description('Init a metasite')
    .action(init)

program
    .command('sitemap')
    .description('Build sitemap and upload files')
    .action(map)

program
    .command('publish')
    .description('Publish sitemap for metasite')
    .action(publish)

program
    .command('broadcast')
    .description('Continue broadcasting unBroadcasted TXs')
    .action(contn)
    
program
    .command('entrance')
    .description('Create a metasite entrance')
    .action(entrance)

program
    .version(require('./package.json').version)
    .option('-k, --key [PrivKey]', 'Bitcoin Private Key for UTXOs')
    .option('-p, --path [path]', 'Path for metasite content')
    .option('-r, --rsa [rsa private key file]', 'RSA key file for metasite')
    .option('-s, --siteId [siteId]', 'metasite ID')

program
    .parse(process.argv);

function map(){
    var questions = []
    if(!program.key){
        questions.push({type:"password",name:"key",message:"Please Specify Bitcoin Private Key:"})
    }
    inquirer.prompt(questions).then(answers=>{
        var hammer = new Hammer({privKey:program.key||answers.key})
        hammer.throwout()
    }).catch(console.log)
}

function contn(){
    var questions = []
    if(!program.key){
        questions.push({type:"password",name:"key",message:"Please Specify Bitcoin Private Key:"})
    }
    inquirer.prompt(questions).then(answers=>{
        var hammer = new Hammer({privKey:program.key||answers.key})
        hammer.broadcast_continue()
    }).catch(console.log)

}

function init(){
    var questions=[
    {type:"input",name:"path",message:"Site's Public Directory:",default:program.path||"./public"},
    {type:"input",name:"siteId",message:"Site's ID:",default:program.siteId||"mysite"},
    {type:"input",name:"rsakey",message:"Site Owner's RSA Private Key, leave blank to generate one:",default:program.rsa},
    ]
    inquirer.prompt(questions).then(answers=>{
        if(answers.path==""||answers.siteId==""){
            console.log("Missing Path/SiteId")
            return
        }
        if(!fs.existsSync(".credentials")){
            fs.mkdirSync('.credentials')
        }
        if(answers.rsakey==""){
            var rsa = new JSEncrypt()
            rsa.default_key_size = 2048
            var privKey=rsa.getPrivateKey()
            if(fs.existsSync('.credentials/key.pem')){
                fs.renameSync('.credentials/key.pem','.credentials/key.pem.old.'+new Date().getTime())
            }
            fs.writeFileSync('.credentials/key.pem',privKey)
            answers.rsakey='./.credentials/key.pem'
        }
        fs.appendFileSync('.gitignore','\n.credentials')
        fs.appendFileSync('.gitignore','\n.gitignore')
        fs.writeFileSync('.credentials/metasite.config.json',JSON.stringify(answers,null,4))
    })
}

function entrance(){
    if(!fs.existsSync('.credentials/metasite.config.json')){
        console.log('Init First')
        return
    }
    var questions = []
    if(!program.key){
        questions.push({type:"password",name:"key",message:"Please Specify Bitcoin Private Key:"})
    }
    inquirer.prompt(questions).then(answers=>{
        var config = JSON.parse(fs.readFileSync('.credentials/metasite.config.json'))
        var siteId = program.siteId || config.siteId
        var rsakey = program.rsa || config.rsakey
        var loader = new Loader({siteId:siteId,rsakey:rsakey})
        return loader.getEntry().then(file=>{
            console.log("Broadcasting Entrance TX")
            datapay.send({
                data:["19HxigV4QyBv3tHpQVcUEQyq1pzZVdoAut", file, "text/html", "utf-8", siteId],
                pay:{key:program.key||answers.key}
            },(err,txid)=>{
                console.log("Broadcasted, Entrance TXID: "+txid)
                fs.writeFileSync(txid,file)
                return inquirer.prompt([{type:"confirm",name:"open",message:"Open in Browser?",default:true}])
                .then(answer=>{
                    // Security Check
                    var pattern = new RegExp('^[0-9a-fA-F]+$')
                    if(answer.open&&pattern.test(txid))return open("https://bico.media/"+txid)
                })
            })
        })
    }).catch(console.log)
}

function publish(){
    if(!fs.existsSync('.credentials/metasite.config.json')){
        console.log('Init First')
        return
    }
    if(!fs.existsSync('sitemap.json')){
        console.log("Build Sitemap First")
        return
    }
    var questions = []
    if(!program.key){
        questions.push({type:"password",name:"key",message:"Please Specify Bitcoin Private Key:"})
    }
    inquirer.prompt(questions).then(answers=>{
        var config = JSON.parse(fs.readFileSync('.credentials/metasite.config.json'))
        var siteId = program.siteId || config.siteId
        var rsakey = program.rsa || config.rsakey
        console.log("SiteID: " + siteId)
        console.log("RSA Key File: " + rsakey)
        var loader = new Loader({siteId:siteId,rsakey:rsakey,sitemap:"sitemap.json"})
        var key = fs.readFileSync(rsakey).toString()
        //console.log(sign(key,"123"))
        //console.log(loader.createScript("0"))
        return loader.querySitemap().then(sitemaps=>{
            var version = 0
            if(sitemaps.length==0)version=0
            else version=parseInt(sitemaps[0].version)+1
            if(version==NaN)version=0
            return version
        }).catch(e=>{
            return 0
        }).then(version=>{
            var registry = loader.getSitemapRegistry(version)
            console.log("Prefix: " + registry.crypticPrefix)
            return registry
        }).then(registry=>{
            var data = siteId + registry.sitemap + registry.version
            //console.log(verify(registry.sitePubkey,data,registry.sig))
            console.log("Broadcasting Sitemap TX")
            datapay.send({
                data:[registry.crypticPrefix, registry.sitemap, registry.sig, registry.version.toString()],
                pay:{key:program.key||answers.key}
            },(err,txid)=>{
                console.log("Broadcasted, TXID: "+txid)
                console.log("Please wait for a confirmation...")
            })
        })
    }).catch(console.log)
    
}
/*
function sign(key,data){
    var sign = crypto.createSign('RSA-SHA256');
    sign.update(data);
    sig = sign.sign(key, 'base64');
    return sig;
}

function verify(pubkey,data,sig){
    var verify = crypto.createVerify('RSA-SHA256');
    verify.update(data);
    return verify.verify(pubkey, sig, 'base64')
}
*/