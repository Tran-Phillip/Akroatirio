
module.exports = class AkroatirioMember {
    constructor(textComponent,emotes,groupComponent) {
        this.username = undefined;
        this.groupProps = groupComponent;
        this.emotes = emotes;
        this.textComponent = textComponent
        this.avaliable = false;
    }

    setGroupProps(props){
        this.groupProps = props;
    }

    getGroupProps(){
        return this.groupProps;
    }

    setEmotes(emotes){
        this.emotes = emotes; 
    }
    getEmotesDict(){
        return this.emotes;
    }
    getEmote(emote){
        
        for(var key in this.emotes){
            if(key.includes(emote)){
                return this.emotes[key];
            }
        }
        return undefined;
    }
    setTextComponent(textComponent){
        this.textComponent = textComponent;
    }
    getTextComponent(){
        return(this.textComponent);
    }
    setUsername(username){
        this.username = username;
    }
    getUsername(){
        return(this.username);
    }
    setID(id){
        this.id = id;
    }
    getID(){
        return this.id;
    }
    toggle(){
        this.avaliable = !this.avaliable;
    }
    isAvaliable(){
        return this.avaliable;
    }

}