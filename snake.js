var canvas= document.getElementById("gamebox");
var ctx =canvas.getContext("2d");
canvas.width=window.innerWidth
canvas.height=window.innerHeight
function drawGame(){
    clearScreen();
}

function clearScreen(){
    var grd = ctx.createRadialGradient(canvas.clientWidth/2, 
    canvas.clientHeight/2, canvas.clientHeight/4, canvas.clientWidth/2, 
    canvas.clientHeight/2, canvas.clientWidth);

    ctx.fillStyle= grd;

    grd.addColorStop(0, "violet");
    grd.addColorStop(1, "plum");

ctx.fillRect(0,0,canvas.clientWidth,canvas.clientHeight)
}

drawGame();
