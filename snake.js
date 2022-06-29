var canvas= document.getElementById("gamebox");
var ctx =canvas.getContext("2d");
canvas.width=400;
canvas.height=400;

let tilecount=20;
let tilesize=18;
let headx=10;
let heady=15;

let xvel= 0;
let yvel=0;

let score=0;

let applex=Math.floor(Math.random()*20);
let appley=Math.floor(Math.random()*20);

const snakebody=[];
let bodylength=0;


document.body.addEventListener('keydown', keydown);

class snakepart{
    constructor(x, y){
        this.x=x;
        this.y=y;
    }
}

function drawGame(){
    
    let speed=7;
    clearScreen();
    drawsnake();
    apple();
    changesnakepos();
    drawscore();
    if(gameover()){
        return;
    }
    
    
    setTimeout(drawGame, 1000/speed);


}

function drawsnake(){

    for(let i=0; i<snakebody.length; i++){
        let part = snakebody[i];
        ctx.fillStyle='dimgray';
        ctx.fillRect(part.x*tilecount, part.y*tilecount, tilesize, tilesize);
    }
    snakebody.push(new snakepart(headx,heady));
    if(snakebody.length>bodylength){
        snakebody.shift();

    }
    ctx.fillStyle='black';

    ctx.fillRect(headx*tilecount, heady*tilecount, tilesize, tilesize);

    if((xvel==0)&&(yvel==0)){
        ctx.fillStyle="white"
        ctx.font='20px Arial';
        ctx.fillText('Use Arrow Keys To Play!', 90, 50)
    }

}

function changesnakepos(){
    headx=headx+xvel;
    heady=heady+yvel;
    }
//has something to do with length and velocity figure out!!!
function clearScreen(){

    var grd = ctx.createRadialGradient(200, 
    200, 100, 200, 
    200, 200);

    ctx.fillStyle= grd;

    grd.addColorStop(0, "violet");
    grd.addColorStop(1, "plum");

ctx.fillRect(0,0,canvas.clientWidth,canvas.clientHeight);
}
function apple(){
    if ((headx==applex) && (heady==appley)){
        applex=Math.floor(Math.random()*20);
        appley=Math.floor(Math.random()*20);
        bodylength++;
        score++;
    }
    
    ctx.fillStyle='red';
    ctx.fillRect(applex*tilecount, appley*tilecount, tilesize, tilesize);
}

function keydown(event){
    if (event.keyCode==38){
        if (yvel==1){
            return;
        }
        yvel=-1;
        xvel=0;
    }
    if (event.keyCode==40){
        if (yvel==-1){
            return;
        }
        yvel=1;
        xvel=0;
    }
    if (event.keyCode==37){
        if (xvel==1){
            return;
        }
        xvel=-1;
        yvel=0;
    }
    if (event.keyCode==39){
        if (xvel==-1){
            return;
        }
        xvel=1;
        yvel=0;
    }

    }

function drawscore(){
    ctx.fillStyle="white"
    ctx.font="10px Verdana"
    ctx.fillText("Score: "+score, canvas.clientWidth-50,10)
}

function gameover(){
    let gameovervar=false;
    if(headx<0){
        gameovervar=true;
    }
    if(headx==tilecount){
        gameovervar=true;
    }
    if(heady<0){
        gameovervar=true;
    }
    if(heady==tilecount){
        gameovervar=true;
    }
    for (let i=0; i<snakebody.length;i++){
        part=snakebody[i];
        if((part.x==headx)&&(part.y==heady)){
            gameovervar=true;
        }
    }
    if (gameovervar){
        ctx.fillStyle='white';
        ctx.font='35px Arial';
        ctx.fillText('Game Over!', 100, 100)
        ctx.font='20px Arial';
        ctx.fillText('Refresh Page To Play Again', 75, 150)
        
    }
return gameovervar;
}

drawGame();

