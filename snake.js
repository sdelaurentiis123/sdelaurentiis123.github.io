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

let applex=Math.floor(Math.random()*20);
let appley=Math.floor(Math.random()*20);

document.body.addEventListener('keydown', keydown);

function drawGame(){
    
    let speed=7;
    clearScreen();
    changesnakepos();
    drawsnake();
    apple()
    
    setTimeout(drawGame, 1000/speed);


}

function drawsnake(){

    ctx.fillStyle='black';

    ctx.fillRect(headx*tilecount, heady*tilecount, tilesize, tilesize);

}

function changesnakepos(){
    headx=headx+xvel;
    heady=heady+yvel;
}

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


drawGame();

