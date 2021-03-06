const tmi = require("tmi.js");
const fs = require("fs");
const OBSWebSocket = require("obs-websocket-js");
const AkroatirioMember = require("./modules/AkroatirioMember.js");
const axios = require('axios')


module.exports = class Akroatirio {
    
    constructor() {
        this.config = this.readConfig("config.json");
        this.client = undefined;
        this.obs = undefined;
        this.audience = [];
        this.queuedMembers = [];
        this.haltAudience = false;
        this.init(); // hack to let me async in t he constructor 
    }

    async init() {
        this.client = this.initalizeClient(this.config);
        this.obs = new OBSWebSocket();
        this.setEventHandlers();
        await this.connect(this.config);
        await this.initalizeAudience();
        console.log("==== Successfully Connected to Twitch and OBS ====");
        setInterval(this.shuffle.bind(this), this.config['dev']['timer']);
    }

    async shuffle(){
        /**
         * Shuffles our current audience and adds members from the queuedMembers queue.
         */
        console.log("==== shuffling called ====");
        if(this.isFull() && this.queuedMembers.length > 0) {
            console.log("---- shuffling! ----")
            
            let currentUsersInChat = await this.getCurrentUsersInChat();


            this.haltAudience = true;
            this.reset(); 
            for(let i = 0; i < this.audience.length; i++) {
                if(currentUsersInChat.includes(this.audience[i].getUsername()))
                {
                    this.queuedMembers.push(this.audience[i].getUsername());
                }
            }

            for(let i = 0; i < this.audience.length; i++){
                if(this.queuedMembers.length > 0){
                    let userToAdd = this.queuedMembers.shift();
                    this.addToAudience(userToAdd);
                }
            }

            this.haltAudience = false;
        } 

    }

    async getCurrentUsersInChat(){
        
        const res = await axios.get('https://tmi.twitch.tv/group/user/apropori/chatters');
        return res.data.chatters.viewers
    }

    async initalizeAudience() {
        let resp = await this.obs.send('GetSceneList');
        for(let i = 0; i < resp.scenes.length; i++){
            if(resp.scenes[i].name === "AKROATIRIO"){
                this.parseSources(resp.scenes[i].sources)
                break;
            }
        }
    }

    async parseSources(sources){
        for(let i = 0; i < sources.length; i++){
            let member = await this.createMember(sources[i])
            this.audience.push(member);
        }
    }

    async createMember(group) { 
        let emotes = {};
        let textComponent = undefined;
        let groupComponent = undefined;
        for(let i = 0; i < group.groupChildren.length; i++) {
            if(group.groupChildren[i].type == 'text_gdiplus_v2'){
                textComponent = await this.obs.send('GetTextGDIPlusProperties', {"source": group.groupChildren[i].name});
            }
            else if(group.groupChildren[i].type == 'image_source'){
                let props = await this.obs.send('GetSceneItemProperties', {"scene-name": "AKROATIRIO", "item": group.groupChildren[i]});
                emotes[group.groupChildren[i].name] = props;
                // set default state to invisible 
                await this.obs.send('SetSceneItemProperties', {"scene-name": "AKROATIRIO", "item": props, "visible": false});
            }
        }
        groupComponent = await this.obs.send('GetSceneItemProperties', {"scene-name": "AKROATIRIO", "item": group});

        // set default state to invisible
        await this.obs.send('SetSceneItemProperties', {"scene-name": "AKROATIRIO", "item": groupComponent, "visible": false});

        return( new AkroatirioMember(textComponent, emotes, groupComponent))
    }
  

    setEventHandlers() {
        this.client.on('message', this.onTwitchMessageHandler.bind(this));
    }

    onTwitchMessageHandler(target, context, msg, self){
        if( self ) { return;}

        const commandName = msg.trim(); 

        if(commandName == '!join'){
            if(!this.haltAudience){
                // stop people from joining the audience during a shuffle
                this.addToAudience(context['display-name']);
                return;
            }
            
        } else if(commandName[0] == '!'){
            this.handleCommand(commandName.slice(1), context['display-name']);
        }

    }

    async addToAudience(username){
        for(let i = 0; i < this.audience.length; i++) {
            if(this.audience[i].isAvaliable()){
                this.audience[i].toggle();
                this.audience[i].setUsername(username);
                this.setupDefaultCharacter(this.audience[i], username);
                console.log(`==== ${username} has joined the audience ====`)
                return;
            }
        }
        // no room to join
        console.log(`==== Queueing ${username} ==== `)
        this.queuedMembers.push(username);
    }

    async handleCommand(commandName, username){
        for(let i = 0; i < this.audience.length; i++) {
            if(username === this.audience[i].getUsername()){
                this.handleEmote(commandName, this.audience[i]);
                return;
            }
        }
    }

    async handleEmote(commandName, audienceMember){
        let emoteProps = audienceMember.getEmote(commandName);
        if(emoteProps != undefined) {
            let defaultProps = audienceMember.getEmote("DEFAULT");
            await this.obs.send('SetSceneItemProperties', {"scene-name": "AKROATIRIO", "item": defaultProps, "visible": false});
            await this.obs.send('SetSceneItemProperties', {"scene-name": "AKROATIRIO", "item": emoteProps, "visible": true});
            await new Promise(r => setTimeout(r, 2000)); // make this customizable
            await this.obs.send('SetSceneItemProperties', {"scene-name": "AKROATIRIO", "item": defaultProps, "visible": true});
            await this.obs.send('SetSceneItemProperties', {"scene-name": "AKROATIRIO", "item": emoteProps, "visible": false});
        }
    }


    async setupDefaultCharacter(audienceMember, username){
        let groupProps = audienceMember.getGroupProps();
        let defaultEmote = audienceMember.getEmote("DEFAULT");
        let textProps = audienceMember.getTextComponent();
        await this.obs.send('SetTextGDIPlusProperties', {"source": textProps.source, "text": username});
        await this.obs.send('SetSceneItemProperties', {"scene-name": "AKROATIRIO", "item": defaultEmote, "visible": true});
        await this.obs.send('SetSceneItemProperties', {"scene-name": "AKROATIRIO", "item": groupProps, "visible": true});

    }

    isFull() {
        for(let i = 0; i < this.audience.length; i++) {
            if(this.audience[i].isAvaliable()) {
                return false;
            }
        }
        return true; 
    }

    reset() {
        for(let i = 0; i < this.audience.length; i++) {
            if(!this.audience[i].isAvaliable()){
                this.audience[i].toggle();
            }
        }
    }

    async connect(config){
        /**
         * @params config {Object} - the parsed config object 
        */
       try{
            await this.client.connect();
        } catch (err) {
            console.log("!--- Could not connect to Twitch Client ---!");
            process.exit(1);
        }

        try {
            await this.obs.connect({
                address: config['dev']['obs_config']['host'] + ":" + config['dev']['obs_config']['port'],
                password: config['dev']['obs_config']['password']
            })
        } catch (err) {
            console.log("!--- Could not connect to OBS ---!");
            process.exit(1);
        }

    }

    initalizeClient(config){
        /**
         * @params config {Object} - the parsed config object 
         */
        const opts = {
            identity: {
                username: config['dev']['twitch_config']['uesrname'],
                password: config['dev']['twitch_config']['secret']
            },
            channels: config['dev']['twitch_config']['channels']
        }
        return(new tmi.client(opts));
    }

    readConfig(configFile) {
        /**
         * @params configFile {string} - the path to config file
         */
        let config = fs.readFileSync(configFile);
        return(JSON.parse(config));
    }
}