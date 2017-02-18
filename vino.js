/* Author: dixonary
 * Text adventure engine version 0.1
 */
var engine = {};
var game   = {};
canvas = null;


/* Variables */
game.FPS                   = 60;  //Hz
game.EnterExitTime         = 300; //ms
engine.ResourcesFolder     = "resources";
engine.ImageExtension      =  ".png";
engine.AudioExtension      =  ".mp3";
engine.loggingMode         = "console";
engine.standardLoggingMode = "none";
game.font="24px sans-serif";
game.scaleFactor = 1;
game.intendedHeight = 1000;
game.fastscroll = false;
game.musicRelVolume = 0.3;
game.audioVolume    = 0.75;
data = {};

engine.regex = {
    anyCommand    : /^\s*\[.*]\s*&?\s*$/,
    label         : /^\s*::\s*([a-z0-9_-]+)\s*$/i,
    goto          : /^\s*->\s*([a-z0-9_-]+)\s*$/i,
    option        : /^\s*\?\s*(.+)\s*->\s*([a-z0-9_-]+)\s*(&?)\s*$/i,
    longcode      : /^\s*```\s*$/,
    code          : /^\s*`(.*)`\s*$/,
    speech        : /^\s*([^:]*)\s*:\s*(.*)\s*$/
};

engine.reset = function() {
    engine.currentLine = 0;
    engine.gotos  = [];
    engine.labels = [];
};


/* Internal functions */

engine.log = function (x) {
    switch(engine.loggingMode) {
    case "console":
        console.log(x);
        break;
    case "none":
        break;
    case "preload":
        if(game.preloader != null)
            game.preloader.log(x);
        break;
    }
}

engine.loadStory = function(storyURL) {

    game.preloader = new gen.Preloader();
    game.preloader.progress = 0.5;
    engine.loggingMode = "preload";

    engine.log("downloading story...");

    $.get({ url: storyURL, success: engine.onLoaded })

}

engine.onLoaded = function(data, textStatus) {
    console.info("Story loaded.");
    engine.rawStory = data;
    engine.compile(data);
    $("#story").html(engine.rawStory.replace("\n","<br>"));
}

// The list of commands which will be compiled.
engine.commands = {
    enter: {
        args: ["ident", "group", "ident", "ident", "dir?"],
        onParse: (res) => {
            engine.charsEnter.push(res[2]);
            engine.preloads.push(engine.getURL("stance",res[2],res[4]));
            engine.preloads.push(engine.getURL("expression",res[2],res[5]));
        }
    },
    exit: {
        args: ["ident", "dir?"],
        onParse: (res) => {
            engine.charsLeave.push(res[2]);
        }
    },
    stance: {
        args: ["ident", "ident"],
        onParse: (res) => {
            engine.preloads.push(engine.getURL("stance",res[2],res[3]));
        }
    },
    expression: {
        args: ["ident", "ident"],
        onParse: (res) => {
            engine.preloads.push(engine.getURL("expression",res[2],res[3]));
        }
    },
    move: {
        args: ["ident", "group"]
    },
    wait: {
        args: ["int"],
        allowSkip: false
    },
    pause: {
        args: ["int"]
    },
    scene: {
        args: ["ident","int?"],
        onParse: (res) => {
            engine.preloads.push(engine.getURL("scene",res[2]));
        }
    },
    sound: {
        args: ["ident"],
        onParse: (res) => {
            engine.preloads.push(engine.getURL("sound",res[2]));
        }
    },
    music: {
        args: ["ident"],
        onParse: (res) => {
            engine.preloads.push(engine.getURL("music",res[2]));
        }
    },
    textbox: {
        args: ["toggle"]
    }

};
engine.compile = function(data) {

    // HELPER FUNCTIONS FOR COMPILATION
    //
    function isCommand(line) {
        return l.match(engine.regex.anyCommand);
    }

    // Match against arbitrary [ blah ] commands
    function parseCommand(line, command, fields) {
        var fieldTypes = [];
        fieldTypes["dir"]       = "(left|right|spot)";
        fieldTypes["ident"]     = "([a-z0-9]+)";
        fieldTypes["group"]     = "(left|right|center)";
        fieldTypes["int"]       = "([0-9]+)";
        fieldTypes["string"]    = "([^\s]*)";
        fieldTypes["toggle"]    = "(hide|show|toggle|clear)";

        var str = "^";
        str += "\\s*\\[\\s*(" + command + ")\\s*";
        for(var i=0; i<fields.length; i++) {
            var reg = fields[i];
            // make optional parameters
            if(fields[i][fields[i].length-1] == "?") {
                reg = fieldTypes[reg.substr(0,reg.length-1)] + "?";
            }
            else {
                reg = fieldTypes[reg];
            }
            str += "\\s*" + reg;
        }
        str += "\\s*\\]\\s*(&)?\\s*";
        str += "$";
        return line.match(new RegExp(str,"i"));
    }
    function constructCommand(match) {
        var res = "engine." + match[1] + "(";
        var pos=2;
        while(pos < match.length) {
            if(match[pos] == "&" || !match[pos]) {
                pos++;
                continue;
            }
            if(pos != 2) {
                res += ",";
            }
            res += "\"" + match[pos] + "\"";
            pos++;
        }
        res += ")"
        if(match[--pos] == "&") {
            if(engine.commands[match[1]].allowSkip == null || engine.commands[match[1]].allowSkip !== false) {
                 res += "; engine.advance();";
            }
            else {
                console.warn("The command on line " + (i+1) +
                " ends in & but skip is not allowed on this command.\nThe skip will be ignored.");
            }
        }
        return res.toLowerCase();
    }

    // convert to lines array
    data = data.split("\n");

    engine.labels = [];
    engine.charsEnter = [];
    engine.charsLeave = [];
    engine.preloads = [];

    // convert lines to javascript commands!
    for(i=0; i<data.length; i++) {
        l = data[i];
        var res; // used to store results

        // empty lines
        if(l == "") {
            data[i] = "engine.advance()";
        }

        // comments
        else if(l[0] == "#") {
            data[i] = "engine.advance();"
        }

        // note line numbers of labels!
        else if(res=l.match(engine.regex.label)) {
            data[i] = "engine.label(\""+res[1]+"\")";
            engine.labels[res[1]] = i;
        }

        // Goto statement
        else if(res=l.match(engine.regex.goto)) {
            data[i] = "engine.goto(\""+res[1]+"\")";
            engine.gotos[i] = res[1];
        }

        // Option statement
        else if(res=l.match(engine.regex.option)) {
            var str = "engine.option(";
            str += "{text:\""+res[1]+"\",label:\""+res[2]+"\"});";
            if(res[3] == "&")
                str += "engine.advance();";
            data[i] = str;
            engine.gotos[i] = res[2];
        }

        else if(isCommand(l)) {
            var found=false;
            for(comm in engine.commands) {
                var c = engine.commands[comm];
                if(res=parseCommand(l, comm, c.args)) {
                    data[i] = constructCommand(res);
                    if(c.onParse) c.onParse(res);
                    found=true;
                    break;
                }
            }
            if(found) continue;
            engine.warn("Malformed command: line " + (i+1) + ": " + l);
            engine.warn("This line will be ignored.");
            data[i] = "engine.advance()";
        }

        // Long code
        else if(res=l.match(engine.regex.longcode)) {
            data[i] = "";
            for(var j=i+1; j<data.length;j++) {
                if(data[j].match(engine.regex.longcode)) {
                    data[j]="engine.advance();";
                    break;
                }
                data[i] += data[j]+"\n";
                data[j]="engine.advance();";
            }
            data[i] += ";engine.advance();";
            i=j;
        }

        // Code
        else if(res=l.match(engine.regex.code)) {
            data[i] = res[1] + ";engine.advance();";
        }

        // Speech
        else if(res=l.match(engine.regex.speech)) {
            txt = res[2];
            res[2] = res[2].replace(/\$([a-z0-9_]+)/gi,"\"+$1+\"");

            data[i] = "engine.say(\""+res[1]+"\",\""+res[2]+"\")";
        }

        else {
            engine.warn("Malformed line: line " + (i+1) + ": " + l);
            engine.warn("This line will be ignored.");
            data[i] = "engine.advance()";
        }

    }

    // Check labels match with goto's
    unmatchedGotos = engine.gotos.filter(g=>engine.labels[g] == null);
    var strRep = unmatchedGotos.reduce(
        (a,b)=>a+"\n\""+b+"\" on line " +engine.gotos.indexOf(b), "")
    if(unmatchedGotos.length>0)
        engine.warn("The following goto statements do not have a corresponding label: "
            + strRep);

    unmatchedLeaves = engine.charsLeave.filter(g=>engine.charsEnter.indexOf(g) == -1);
    if(unmatchedLeaves.length>0)
        engine.warn("The following characters leave but do not enter: "
            + unmatchedLeaves);


    //Preload other Resources:
    engine.preloads.push(engine.getURL("image","textbox"));
    engine.preloads.push(engine.getURL("image","charbox"));
    engine.preloads.push(engine.getURL("image","optionbox"));
    //engine.log(engine.preloads);

    //Get character data for every character
    engine.characters = [];
    // Remove duplicate entries
    engine.charsEnter = engine.charsEnter.filter((i,p)=>engine.charsEnter.indexOf(i) == p);
    engine.preloads   = engine.preloads.filter((i,p)=>engine.preloads.indexOf(i) == p);

    engine.remainingChars     = engine.charsEnter.length;
    engine.remainingResources = engine.preloads.length;
    for(var i=0;i<engine.charsEnter.length; i++) {
        $.ajax({
            dataType:"json",
            url:engine.getURL("chardata",engine.charsEnter[i]),
            success:engine.loadCharacterData.bind(null,engine.charsEnter[i])});
    }
    for(var i=0; i<engine.preloads.length; i++) {
        var url = engine.preloads[i];
        /*
        $.ajax({
            url:url,
            success:engine.loadResource.bind(null,url)});
        */
        if(url.substr(-4) == engine.ImageExtension)      {
          k = new Image();
          k.onload = engine.loadResource.bind(null,url);
        }
        else if(url.substr(-4) == engine.AudioExtension) {
          k = new Audio();
          $(k).on("loadeddata",engine.loadResource.bind(null,url));
        }
        k.src = url;
    }

    engine.story = data;

}

engine.getURL = function(type,...details) {
    var resString = engine.ResourcesFolder+"/";
    details = details.map(s=>s.toLowerCase());
    switch(type) {
        case "chardata":
            resString += "characters/"+details[0]+"/info.json";
            break;
        case "scene":
            resString += "scenes/"+details[0]+engine.ImageExtension;
            break;
        case "expression":
        case "stance":
            resString += "characters/"+details[0]+"/"+details[1]+engine.ImageExtension;
            break;
        case "image":
            resString += details[0]+engine.ImageExtension;
            break;
        case "sound":
            resString += "sounds/"+details[0]+engine.AudioExtension;
            break;
        case "music":
            resString += "music/"+details[0]+engine.AudioExtension;
            break;
        case "other":
            resString += details[0];
            break;
    }
    return resString;
}

// start once ALL characters have their data loaded.
engine.loadCharacterData = function(id,data) {
    engine.characters[id]  = data;
    engine.remainingChars--;
    engine.log("Loaded character info: \""+id+"\"");
    game.preloader.progress1 = 1-(engine.remainingChars
        / (engine.charsEnter.length));
    if(engine.remainingResources+engine.remainingChars == 0)
        engine.donePreloading();
}
engine.loadResource = function(url) {
    engine.remainingResources--;
    game.preloader.progress2 = 1-((engine.remainingResources+engine.remainingChars)
        / (engine.preloads.length+engine.charsEnter.length));
    engine.log("Loaded resource \""+url+"\"");
    if(engine.remainingResources+engine.remainingChars == 0)
        engine.donePreloading();
}

engine.donePreloading = function() {
    game.preloader = null;
    engine.loggingMode = engine.standardLoggingMode;
    engine.play();
}


/* Story driving functions */

engine.play = function() {
    try {
        eval.apply(this,[engine.story[engine.currentLine]]);
    }
    catch(e) {
        console.error("An error occurred on line " + engine.currentLine + ":");
        console.error(e);
    }
}

engine.option = function(option) {
    game.readyToAdvance = false;
    if(game.options == null) {
        game.options = new gen.Options();
        game.options.fadeIn();
    }
    game.options.addOption(option);
    engine.log("OPTION "+game.options.options.length+": "+option.text+" -> " + option.label);
}

engine.advance = function() {
    var prev = engine.currentLine;
    engine.currentLine = Math.min(engine.currentLine+1, engine.story.length-1);
    engine.readyToAdvance = true;
    if(prev != engine.currentLine)
        engine.play();
}

engine.goto = function(label) {
    engine.log("Going to \""+label+"\"");
    engine.currentLine = engine.labels[label];
    engine.play();
}

engine.label = function(label) {
    engine.log("Hit label \""+label+"\"; continuing");
    engine.advance();
}

engine.say = function(c, text) {
    engine.log(c+": " + text);
    game.say(c,text);
}

engine.enter = function(c, loc, stance, expr, dir) {
    dir = dir || (loc=="center"?"right":loc);

    engine.log(c+" enters and moves to " + loc + ", faces " + dir + ". they seem " + expr + " and are standing " + stance + ".");

    new gen.Character(c,loc,stance,expr,dir);
}

engine.exit = function(c, dir) {
    dir = dir || "right";
    engine.log(c + " leaves to the " + dir+".");
    game.findChar(c).exit(dir);
}

engine.stance = function(c,stance) {
    engine.log(c+" is now standing " + stance+".");
    game.findChar(c).setStance(stance);
}

engine.expression = function(c,expression) {
    engine.log(c+" now looks " + expression+".");
    game.findChar(c).setExpression(expression);
}

engine.move = function(c, loc) {
    game.findChar(c).setLocation(loc);
}

engine.wait = function(time) {
    engine.readyToAdvance = false;
    setTimeout(engine.advance,time);
}
engine.pause = function(time) {
    engine.readyToAdvance = false;
    if(time != 0)
        setTimeout(()=>engine.readyToAdvance=true,time);
}

engine.scene = function(name,speed) {
    game.changeScene(name,speed);
}

engine.sound = function(name) {
    game.sound(name);
}

engine.music = function(name) {
    game.music(name);
}

engine.textbox = function(doWhat) {
    switch(doWhat) {
        case "show"  : game.text.targetAlpha=game.text.maxAlpha;break;
        case "hide"  : game.text.targetAlpha=0;                 break;
        case "toggle": game.text.targetAlpha=game.text.maxAlpha-game.text.targetAlpha;break;
        case "clear" : engine.say("","");
    }
}


/* Helper functions */

engine.warn = function(str) {
    console.warn(str);
}

engine.error = function(str) {
    throw "StoryCompilationError:\n" + str + "\nExecution is unable to continue.";
}

engine.onclick = function(event) {
    if(game.options != null) {
        game.options.onClick();
        return;
    }
    if(game.text.remText.length != 0) {
        game.text.more();
    }
    else if(engine.readyToAdvance) {
        engine.advance();
    }

}

engine.mousePos = function(event) {
    canvas_x = event.pageX-game.target.offset().left;
    canvas_y = event.pageY-game.target.offset().top;
    if(game.options != null) {
        game.options.mousePos(canvas_x,canvas_y);
    }
}



// Set the div that the game should be drawn into.
// This will also set the width and height.
game.setTarget = function(id) {
    game.target = $("#"+id);
    game.WIDTH  = game.target.width();
    game.HEIGHT = game.target.height();
    game.scaleFactor = game.target.height()/game.intendedHeight;

    var canvasElement = $("<canvas width='"+game.WIDTH+"' height='"
        +game.HEIGHT+"' style='width:100%;height:100%;'></canvas>");
    canvasElement.appendTo(game.target);
    canvas = canvasElement.get(0).getContext("2d");

    canvasElement.get(0).addEventListener("mousedown", engine.onclick, false);
    canvasElement.get(0).addEventListener("mousemove", engine.mousePos, false);

    canvas.font = game.font;

    canvas.imageSmoothingEnabled = true;

    game.reset();
}

// Get a character by name on screen.
// Will return the leftmost one if there are multiple with the same name.
game.findChar = function(c) {
    var gs = ["left","center","right"];
    for(var i=0; i<gs.length; i++) {
        for(var x=0; x<game.groups[gs[i]].length; x++) {
            if(game.groups[gs[i]][x].name == c) return game.groups[gs[i]][x];;
        }
    }
}

game.reset = function() {
    if(game.interval)    clearInterval(game.interval);
    game.interval = setInterval(game.tick, 1000/game.FPS);

    game.characters = [];
    game.images = [];
    game.backgrounds = [];
    if(canvas) canvas.clearRect(0,0,game.WIDTH,game.HEIGHT);

    game.groups = [];
    game.groups.left = new gen.Group(game.WIDTH/4, game.WIDTH/3);
    game.groups.center = new gen.Group(game.WIDTH/2, game.WIDTH/3);
    game.groups.right = new gen.Group(game.WIDTH/4*3, game.WIDTH/3);

    game.text = new gen.Textfield();

}

game.tick = function() {
    if(game.lastUpdate == null) {
        game.lastUpdate = (new Date()).getTime();
    }
    else {
        game.tickTime = ((new Date()).getTime() - game.lastUpdate)/1000;
        game.lastUpdate = (new Date()).getTime();
    }
    game.update();
    game.draw();
}

game.update = function() {

    for(i=0; i<game.backgrounds.length;i++) {
        game.backgrounds[i].update();
    }
    var gs = ["left","center","right"];
    for(var i=0; i<gs.length; i++) {
        game.groups[gs[i]].update();
    }

    if(game.options != null) {
        game.options.update();
    }

    game.text.update();
}

game.music = function(name) {
    var mus = new Audio();
    mus.src = engine.getURL("music",name);
    mus.play();

    var musInFade = setInterval(function() {
        arguments.callee.count=arguments.callee.count+1||1;
        var vol = game.musicRelVolume * game.audioVolume;
        mus.volume = Math.min(vol,mus.volume+0.05);
        if(mus.volume == vol || arguments.callee.count>20) {
            clearInterval(musInFade);
        }
    },100);

    var oldMus = game.currentMusic;
    if(game.currentMusic != undefined) {
        var musOutFade = setInterval(function() {
            oldMus.volume = Math.max(0,oldMus.volume-0.05);
            if(oldMus.volume == 0 ) {
                clearInterval(musOutFade);
            }
        },100);
    }

    mus.loop = true;
    mus.volume = 0;
    game.currentMusic = mus;
}

game.sound = function(name) {
    var snd = new Audio();
    snd.src = engine.getURL("sound",name);
    snd.volume = game.audioVolume;
    snd.play();
}

game.draw = function() {
    if(!canvas) return;
    //canvas.clearRect(0,0,game.WIDTH,game.HEIGHT);

    for(i=game.backgrounds.length-1; i>=0;i--) {
        game.backgrounds[i].draw();
    }
    var gs = ["left","center","right"];
    for(var i=0; i<gs.length; i++) {
        game.groups[gs[i]].draw();
    }

    if(game.options != null) {
        game.options.draw();
    }

    if(game.preloader != null) {
        game.preloader.draw();
    }

    game.text.draw();
}

game.say = function(char, text) {

    game.text.type(char,text);

}

game.changeScene = function(name,val) {
    for(var i=0; i<game.backgrounds.length; i++) {
        game.backgrounds[i].fadeOut();
    }
    var newBG = gen.Background(name);
    game.backgrounds.push(newBG);
    if(!game.currentBG) {
        game.currentBG = newBG;
        newBG.fadeIn();
    }

    if(val != null) {
        newBG.fadeSpeed = 1000/val/game.FPS;
        for(var i=0; i<game.backgrounds.length; i++) {
            game.backgrounds[i].fadeSpeed = 1000/val/game.FPS;
        }
    }
}


/* Objct generators */
gen = {};



gen.Preloader = function() {
    var pr = {};

    pr.barW = game.WIDTH/3*2;
    pr.barH = game.HEIGHT/16;
    pr.barY = game.HEIGHT/6;
    pr.logY = game.HEIGHT/3;
    pr.logWidth = game.WIDTH/3*2;
    pr.textHeight = 20;
    pr.hintingColor = "hotpink";
    pr.bgColor      = "#111";
    pr.fgColor      = "white";

    pr.showLogs = true;

    pr.margin = 5;

    pr.logs = [];
    pr.maxLogs = Math.floor((game.HEIGHT-pr.logY)/pr.textHeight)-1;

    pr.progress1 = 0;
    pr.progress2 = 0;

    pr.draw = function() {
        var prev_fs = canvas.fillStyle;
        var prev_ss = canvas.strokeStyle;
        canvas.fillStyle = pr.fgColor;
        canvas.strokeStyle = pr.fgColor;


        canvas.strokeRect(game.WIDTH/2-pr.barW/2, pr.barY-pr.barH/2,
                          pr.barW, pr.barH);

        canvas.fillRect(game.WIDTH/2-pr.barW/2+pr.margin, pr.barY-pr.barH/2+pr.margin,
                          pr.progress1*(pr.barW-pr.margin*2), (pr.barH-pr.margin*2));

        canvas.fillStyle = pr.hintingColor;
        canvas.fillRect(game.WIDTH/2-pr.barW/2+pr.margin, pr.barY-pr.barH/2+pr.margin,
                          pr.progress2*(pr.barW-pr.margin*2), (pr.barH-pr.margin*2));

        if(pr.showLogs) {
            canvas.strokeRect(game.WIDTH/2-pr.logWidth/2, pr.logY,
                              pr.logWidth, game.HEIGHT);

            canvas.fillStyle = pr.bgColor;
            canvas.fillRect(game.WIDTH/2-pr.logWidth/2+pr.margin, pr.logY+pr.margin,
                    pr.logWidth-pr.margin*2, game.HEIGHT-pr.logY);
            canvas.fillStyle = pr.fgColor;;

            canvas.font = "16px monospace";
            var line=0;
            for(var i=0; i<pr.logs.length; i++) {
                var rem = pr.logs[i];
                while(rem != "") {
                    var chars;
                    for(chars=0; canvas.measureText(rem.substr(0,chars)).width<pr.logWidth
                                && chars<=rem.length;chars++){
                    }
                    canvas.fillText(rem.substr(0,chars)
                        ,game.WIDTH/2-pr.logWidth/2+pr.margin*2,pr.logY+pr.textHeight*(line+1)+pr.margin);
                    rem = rem.substr(chars);
                    line++;
                }
            }
        }

        canvas.font = game.font;
        canvas.fillStyle = prev_fs;
        canvas.strokeStyle = prev_ss;
    }

    pr.log = function(x) {
        pr.logs.push(x.toString());
        if(pr.logs.length > pr.maxLogs) {
            pr.logs.splice(0,1);
        }
    }

    return pr;
}


gen.Group = function(position,width) {

    var gr = [];
    gr.position = position;
    gr.width    = width;

    gr.addCharacter = function(char) {
        if(char.x > gr.position)
            gr.push(char);
        else
            gr.splice(0,0,char);

        gr.recalc();
    }

    gr.remCharacter = function(char) {
        gr.splice(gr.indexOf(char),1);
        gr.recalc();
    }

    gr.recalc = function() {

        for(var i=0; i<gr.length; i++) {
            gr[i].targetX = ((i*2+1) / (gr.length*2)-0.5)*gr.width+gr.position
                - gr[i].width*gr[i].scaleFactor/2;
        }

    }

    gr.update = function() {
        for(var i=0; i<gr.length; i++) {
            gr[i].update();
        }
    }

    gr.draw = function() {
        for(var i=0; i<gr.length; i++) {
            gr[i].draw();
        }
    }

    return gr;

}

gen.Textfield = function() {

    var tf = {};

    tf.currentLine = 0;
    tf.currentText = [];
    tf.remText     = [];
    tf.full        = false;
    tf.height      = 210;
    tf.width       = game.WIDTH;
    tf.y           = game.HEIGHT - tf.height;
    tf.x           = 0;
    tf.textHeight  = 30;
    tf.char        = "";
    tf.ticker      = 0;
    tf.ticksPerChar= 1;
    tf.alpha       = 0;
    tf.maxAlpha    = 0.8;
    tf.fadeSpeed   = 2/game.FPS;
    tf.margin      = 10;
    tf.charBoxH    = tf.textHeight|0;

    tf.textBoxImg  = new Image();
    tf.textBoxImg.src=engine.getURL("image","textbox");

    tf.charBoxImg  = new Image();
    tf.charBoxImg.src=engine.getURL("image","charbox");

    tf.renderCanvas = document.createElement("canvas");
    tf.renderCanvas.width = tf.width;
    tf.renderCanvas.height=tf.height+tf.charBoxH;


    tf.rerender = function() {

        var can = tf.renderCanvas.getContext("2d");
        can.clearRect(0,0,tf.renderCanvas.width,tf.renderCanvas.height);
        can.font = game.font;
        can.drawImage(tf.textBoxImg, 0,0,tf.textBoxImg.naturalWidth,tf.textBoxImg.naturalHeight,
            0,tf.charBoxH,tf.width,tf.height);
        for(var i=0; i<=tf.currentLine; i++) {
            if(tf.currentText[i] == undefined) break;
            can.fillText(tf.currentText[i], tf.margin, tf.charBoxH + (i+1)*tf.textHeight+tf.margin);
        }

        if(tf.char.match(/[^\s]/)){
            can.drawImage(tf.charBoxImg, 0,0,tf.charBoxImg.naturalWidth,tf.charBoxImg.naturalHeight,
                30,1,can.measureText(tf.char).width+tf.margin*2,tf.charBoxH);
            can.fillText(tf.char, 30+tf.margin, tf.charBoxH-3);
        }

    }


    tf.update = function() {
        //fade out
        if(tf.alpha > tf.targetAlpha) {
            tf.alpha -= tf.fadeSpeed;
            if(tf.alpha < tf.targetAlpha)
                tf.alpha = tf.targetAlpha;
        }
        // fade in
        else if(tf.alpha < tf.targetAlpha) {
            tf.alpha += tf.fadeSpeed;
            if(tf.alpha > tf.targetAlpha)
                tf.alpha = tf.targetAlpha;
        }

        if(tf.remText.length==0) return;
        if(!tf.full) {
            tf.ticker = (tf.ticker+1)%tf.ticksPerChar;
            if(tf.ticker == 0) {
                if(game.fastscroll) {
                    tf.writeAll();
                }
                else {
                    tf.typeCharacter();
                }
            }
        }

    }

    tf.typeCharacter = function(rerender) {
        if(rerender === undefined) rerender = true;
        var i=0;
        if(tf.remText.length == 0) return;
        while(tf.remText[0] == "") {
            tf.remText.splice(0,1);
            tf.currentLine++;
            if(tf.currentLine >= Math.floor(tf.height/tf.textHeight)-1) {
                tf.full = true;
                engine.log(tf.remText);
                return;
            }
            tf.currentText[tf.currentLine] = "";
        }
        if(tf.remText.length == 0) {
            engine.readyToAdvance=true;
            return;
        }
        tf.currentText[tf.currentLine] += tf.remText[0].substr(0,1);
        if(rerender) tf.rerender();
        tf.remText[0] = tf.remText[0].substr(1);
    }

    tf.draw = function() {
        canvas.globalAlpha = tf.alpha;
        canvas.drawImage(tf.renderCanvas,tf.x,tf.y-tf.charBoxH);
        canvas.globalAlpha = 1;
    }

    tf.type = function(char, text) {
        tf.currentLine = 0;
        tf.full = false;
        tf.setChar(char);
        tf.currentText = [""];
        tf.remText = [];

        text = text.split("\n");
        text = text.map(t=>t.split(" "));
        var rtCount=0;
        // automate word wrap
        for(var i=0; i<text.length; i++) {
            tf.remText[rtCount] = "";
            for(var j=0; j<text[i].length; j++) {
                if(tf.remText[rtCount] != "") tf.remText[rtCount] += " ";

                if(canvas.measureText(tf.remText[rtCount]+text[i][j]).width > tf.width-tf.margin*2) {
                    rtCount++;
                    tf.remText[rtCount] = "";
                }
                tf.remText[rtCount] = tf.remText[rtCount] + text[i][j];
            }
            rtCount++;
        }
        tf.rerender();

    }

    // Engine asks for more. Print all, or change to next page.
    tf.more = function() {
        if(!tf.full) {
            tf.writeAll();
        }
        else {
            tf.currentLine = 0;
            tf.currentText = [""];
            tf.full = false;
            tf.rerender();
        }
    }

    tf.setChar = function(char) {
        tf.char = char;
    }

    tf.writeAll = function() {
        while(tf.remText.length!=0 && !tf.full) {
            tf.typeCharacter(false);
        }
        tf.rerender();
        engine.readyToAdvance = true;
    }

    tf.fadeIn = function() {
        tf.alpha = 0;
        tf.targetAlpha = tf.maxAlpha;
    }

    tf.fadeOut = function() {
        tf.alpha = tf.maxAlpha;
        tf.targetAlpha = 0;
    }

    return tf;

}

gen.Character = function(name,location,stance,expression,direction) {

    var char = {};

    char.data = engine.characters[name];
    char.width = char.data.width;
    char.height= char.data.height;
    char.scaleFactor = char.data.scaleFactor * game.scaleFactor;
    char.flipped = false;

    char.name = name;
    char.x = direction=="left"?-char.width*char.scaleFactor:game.WIDTH;
    char.y = game.HEIGHT-char.height*char.scaleFactor;
    char.location = location;
    char.stances = [];
    char.expressions = [];
    char.targetX = 0;
    char.speed = 1000;  // pixels per second

    char.setScale = function(amt) {
        char.scaleFactor = amt * game.scaleFactor;
        for(var i=0; i<char.stances.length; i++) {
            i.recanvas();
        }
        for(var i=0; i<char.expressions.length; i++) {
            i.recanvas();
        }
    }

    char.setStance = function(name) {
        for(var i=0; i<char.stances.length; i++) {
            setTimeout(char.stances[i].fadeOut,180);
        }
        char.stances.push(new gen.Stance(char,name));
        char.stances[char.stances.length-1].fadeIn();
    }
    char.setExpression = function(name) {
        for(var i=0; i<char.expressions.length; i++) {
            setTimeout(char.expressions[i].fadeOut,180);
        }
        char.expressions.push(new gen.Expression(char,name));
        char.expressions[char.expressions.length-1].fadeIn();
    }

    char.setLocation = function(location) {
        if(char.group) {
            char.group.remCharacter(char);
        }
        var group = game.groups[location];
        group.addCharacter(char);
        char.group = group;
        if(direction=="spot") {
            char.x = char.targetX;
        }
    }

    char.exit = function(direction) {
        if(direction==null) direction = (location == "left" ? "left" : "right");
        if(direction == "spot") {
            char.stances[0].fadeOut();
            char.expressions[0].fadeOut();
            var i = setInterval(function() {
                if(char.stances[0] == null) {
                    clearInterval(i);
                    char.destroy();
                }
            },17);
        }
        else {
            char.targetX = direction =="left" ? -char.width : game.WIDTH;
            char.onReachTarget = char.destroy;
        }
    }

    char.setLocation(location);
    char.setStance(stance);
    char.setExpression(expression);

    char.update = function() {
        if(char.x > char.targetX) {
            char.x -= char.speed * game.tickTime;
            if(char.x < char.targetX) {
                if(char.onReachTarget) char.onReachTarget();
                char.x = char.targetX;
            }
        }
        if(char.x < char.targetX) {
            char.x += char.speed * game.tickTime;
            if(char.x > char.targetX) {
                if(char.onReachTarget) char.onReachTarget();
                char.x = char.targetX;
            }
        }
        for(var i=0; i<char.stances.length; i++) char.stances[i].update();
        for(var i=0; i<char.expressions.length; i++) char.expressions[i].update();
    }

    char.draw = function() {
        for(var i=0; i<char.stances.length; i++) char.stances[i].draw();
        for(var i=0; i<char.expressions.length; i++) char.expressions[i].draw();
    }

    char.destroy = function() {
        char.group.remCharacter(char);
    }


    return char;

}

gen.Stance = function(parent,name) {

    var stance = {};
    stance.img = new Image();
    stance.img.src=engine.getURL("stance",parent.name,name);
    stance.alpha = 1;
    stance.targetAlpha = 1;
    stance.fadeSpeed = (4/game.FPS);
    stance.parent = parent;

    //setup flip
    stance.recanvas = function() {
        stance.regular = document.createElement('canvas');
        stance.regular.width = parent.width*parent.scaleFactor;
        stance.regular.height = parent.height*parent.scaleFactor;
        stance.regularC = stance.regular.getContext('2d');
        stance.regularC.drawImage(stance.img,0,0,stance.img.naturalWidth,stance.img.naturalHeight,
            0,0,stance.regular.width,stance.regular.height);

        stance.flipped = document.createElement('canvas');
        stance.flipped.width = parent.width*parent.scaleFactor;
        stance.flipped.height = parent.height*parent.scaleFactor;
        stance.flippedC = stance.flipped.getContext('2d');
        stance.flippedC.scale(-1,1);
        stance.flippedC.drawImage(stance.img,0,0,stance.img.naturalWidth,stance.img.naturalHeight,
            -stance.flipped.width,0,stance.flipped.width,stance.flipped.height);
    }
    stance.img.onload = stance.recanvas;

    stance.draw = function() {
        if(!stance.regular) return;
        canvas.globalAlpha = stance.alpha;
        var x = parent.x;
        var y = parent.y;
        canvas.drawImage(parent.flipped?stance.flipped:stance.regular,x,y);
        /*
        canvas.drawImage(parent.flipped?stance.flipped:stance.img, 0, 0,
            stance.img.naturalWidth, stance.img.naturalHeight,
            x , y, stance.img.naturalWidth*parent.scaleFactor,
            stance.img.naturalHeight*parent.scaleFactor);
            */

        canvas.globalAlpha = 1.0;
    }

    stance.update = function() {
        //fade out
        if(stance.alpha > stance.targetAlpha) {
            stance.alpha -= stance.fadeSpeed;
            if(stance.alpha < stance.targetAlpha)
                stance.destroy();
        }
        // fade in
        else if(stance.alpha < stance.targetAlpha) {
            stance.alpha += stance.fadeSpeed;
            if(stance.alpha > stance.targetAlpha)
                stance.alpha = stance.targetAlpha;
        }
    }

    stance.fadeIn = function() {
        stance.alpha = 0;
        stance.targetAlpha = 1;
    }

    stance.fadeOut = function() {
        stance.alpha = 1;
        stance.targetAlpha = 0;
    }
    stance.destroy = function() {
        stance.parent.stances.splice(stance.parent.stances.indexOf(stance),1);
    }

    return stance;

}

gen.Expression = function(parent,name) {

    var expr = {};
    expr.img = new Image();
    expr.img.src=engine.getURL("expression",parent.name,name);
    expr.alpha = 1;
    expr.targetAlpha = 1;
    expr.fadeSpeed = (4/game.FPS);
    expr.parent = parent;

    //setup flip
    expr.recanvas = function() {
        expr.regular = document.createElement('canvas');
        expr.regular.width = parent.width*parent.scaleFactor;
        expr.regular.height = parent.height*parent.scaleFactor;
        expr.regularC = expr.regular.getContext('2d');
        expr.regularC.drawImage(expr.img,0,0,expr.img.naturalWidth,expr.img.naturalHeight,
            0,0,expr.regular.width,expr.regular.height);

        expr.flipped = document.createElement('canvas');
        expr.flipped.width = parent.width*parent.scaleFactor;
        expr.flipped.height = parent.height*parent.scaleFactor;
        expr.flippedC = expr.flipped.getContext('2d');
        expr.flippedC.scale(-1,1);
        expr.flippedC.drawImage(expr.img,0,0,expr.img.naturalWidth,expr.img.naturalHeight,
            -expr.flipped.width,0,expr.flipped.width,expr.flipped.height);
    };
    expr.img.onload = expr.recanvas;

    expr.draw = function() {
        if(!expr.regular) return;
        canvas.globalAlpha = expr.alpha;
        var x = parent.x;
        var y = parent.y;
        canvas.drawImage(parent.flipped?expr.flipped:expr.regular,x,y);
        /*
        canvas.drawImage(parent.flipped?expr.flipped:expr.img, 0,0,expr.img.naturalWidth,expr.img.naturalHeight,
                x ,y,expr.img.naturalWidth*parent.scaleFactor, expr.img.naturalHeight*parent.scaleFactor);
                */
        canvas.globalAlpha = 1.0;
    }

    expr.update = function() {
        //fade out
        if(expr.alpha > expr.targetAlpha) {
            expr.alpha -= expr.fadeSpeed;
            if(expr.alpha < expr.targetAlpha)
                expr.destroy();
        }
        // fade in
        else if(expr.alpha < expr.targetAlpha) {
            expr.alpha += expr.fadeSpeed;
            if(expr.alpha > expr.targetAlpha)
                expr.alpha = expr.targetAlpha;
        }
    }

    expr.fadeIn = function() {
        expr.alpha = 0;
        expr.targetAlpha = 1;
    }

    expr.fadeOut = function() {
        expr.alpha = 1;
        expr.targetAlpha = 0;
    }
    expr.destroy = function() {
        expr.parent.expressions.splice(expr.parent.expressions.indexOf(expr),1);
    }

    return expr;

}


gen.Options = function() {

    opt = {};
    engine.readyToAdvance = false;
    opt.options      = [];
    opt.bgImg        = new Image();
    opt.bgImg.src    = engine.getURL("image","optionbox");
    opt.regionHeight = game.text.y;
    opt.regionTop    = 0;
    opt.optWidth     = 600;
    opt.optHeight    = 50;
    opt.selected     = null;
    opt.normalAlpha  = 0.6;
    opt.selectedAlpha= 1;
    opt.alpha        = 0;
    opt.targetAlpha  = 1;
    opt.fadeSpeed    = 4/game.FPS;
    opt.selectable   = false;

    opt.addOption = function(o) {
        opt.options.push(o);
    }

    opt.update = function() {
        //fade out
        if(opt.alpha > opt.targetAlpha) {
            opt.alpha -= opt.fadeSpeed;
            if(opt.alpha < opt.targetAlpha)
                opt.destroy();
        }
        // fade in
        else if(opt.alpha <= opt.targetAlpha) {
            opt.alpha += opt.fadeSpeed;
            if(opt.alpha > opt.targetAlpha) {
                opt.alpha = opt.targetAlpha;
                opt.selectable = true;
            }
        }
    }
    opt.fadeIn = function() {
        opt.alpha = 0;
        opt.targetAlpha = 1;
    }
    opt.fadeOut = function() {
        opt.alpha = 1;
        opt.targetAlpha = 0;
    }

    opt.destroy = function() {
        game.options = null;
    }

    opt.draw = function() {
        for(var i=0; i<opt.options.length; i++) {
            canvas.globalAlpha = opt.alpha * ((opt.selected == i)
                ? opt.selectedAlpha
                : opt.normalAlpha);

            var y = (opt.regionHeight/(opt.options.length+1) * (i+1))
                -opt.optHeight/2+opt.regionTop;

            canvas.drawImage(opt.bgImg,0,0,opt.bgImg.naturalWidth,opt.bgImg.naturalHeight,
            game.WIDTH/2-opt.optWidth/2,
            (opt.regionHeight/(opt.options.length+1) * (i+1))-opt.optHeight+opt.regionTop,
            opt.optWidth,opt.optHeight);

            canvas.fillText(opt.options[i].text,
                game.WIDTH/2-canvas.measureText(opt.options[i].text).width/2,
                y+opt.optHeight*1/6);

        }
        canvas.globalAlpha = 1;
    }

    opt.onClick = function() {
        if(opt.selected != null && opt.selectable && opt.options[opt.selected].label != "") {
            opt.destroy();
            engine.goto(opt.options[opt.selected].label);
            opt.selectable = false;
        }
    }

    opt.mousePos = function(x,y) {
        opt.selected=null;
        for(var i=0; i<opt.options.length; i++) {
            var ky = (opt.regionHeight/(opt.options.length+1) * (i+1))
                -opt.optHeight+opt.regionTop;
            var left = game.WIDTH/2-opt.optWidth/2;
            var right= game.WIDTH/2+opt.optWidth/2;
            var top  = ky;
            var bottom = ky+opt.optHeight;
            if(x >= left && x <= right && y>=top && y<=bottom) {
                opt.selected=i;
                break;
            }
        }
    }

    return opt;

}

gen.Background = function(name) {

    var bg = {};
    bg.img = new Image();
    bg.img.src = engine.getURL("scene",name);
    bg.alpha = 1;
    bg.targetAlpha = 1;
    bg.fadeSpeed = (2/game.FPS) // per frame

    bg.draw = function() {
        canvas.globalAlpha = bg.alpha;
        canvas.drawImage(bg.img,0,0,game.WIDTH,game.HEIGHT);
        canvas.globalAlpha = 1.0;
    }
    bg.update = function() {
        //fade out
        if(bg.alpha > bg.targetAlpha) {
            bg.alpha -= bg.fadeSpeed;
            if(bg.alpha < bg.targetAlpha)
                bg.destroy();
        }
        // fade in
        else if(bg.alpha < bg.targetAlpha) {
            bg.alpha += bg.fadeSpeed;
            if(bg.alpha > bg.targetAlpha)
                bg.alpha = bg.targetAlpha;
        }
    }
    bg.fadeIn = function() {
        bg.alpha = 0;
        bg.targetAlpha = 1;
    }
    bg.fadeOut = function() {
        bg.alpha = 1;
        bg.targetAlpha = 0;
    }

    bg.destroy = function() {
        game.backgrounds.splice(game.backgrounds.indexOf(bg),1);
    }

    return bg;

}

engine.reset();
game.reset();
