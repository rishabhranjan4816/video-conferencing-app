require("dotenv").config();
const express = require("express");
const app = express();

const http = require("http");
const {Server} = require("socket.io")
const server = http.createServer(app);
const io =new Server(server);

app.set("view engine","ejs");
const MongoStore = require("connect-mongo").default;
const session = require("express-session");
const bcrypt = require("bcryptjs");
app.use(express.static("public"));
const mongoose = require("mongoose");
const User = require("./models/user");
app.use(express.urlencoded({extended: true}));
app.set("trust proxy",1);
app.use(session({
    secret: process.env.SESSION_SECRET || "my super secret code",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URL || "mongodb://127.0.0.1:27017/videoconf",
    }),
}));


mongoose.connect(process.env.MONGO_URL || "mongodb://127.0.0.1:27017/videoconf")
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

app.get("/",(req,res) => {
    res.render("home");
});

function requireLogin(req,res,next){
    if(!req.session.userId){
        return res.redirect("/login");
    }
        next();
}
app.get("/signup",(req,res) => {
    res.render("signup");
});
app.post("/signup",async (req,res) => {
    try{
        const {name,email,password} = req.body;
        const hash = await bcrypt.hash(password,10);
        await User.create({name,email,password:hash});
        res.redirect("/login");
    } catch(err){
        console.log(err);
        res.send("Signup failed. Email may be already registered.");
    }
});
app.get("/login",(req,res) => {
    res.render("login");
});
app.post("/login",async (req,res) => {
    const {email,password} = req.body;
    const user =await User.findOne({email});
    if(!user || !(await bcrypt.compare(password,user.password))){
        return res.send("Invalid email or password");
    } 
    req.session.userId = user._id;
    req.session.name=user.name;
    res.redirect("/");
});

app.get("/new",requireLogin,(req,res) => {
    res.redirect("/room/"+Math.random().toString(36).slice(2,8));
});
app.get("/room/:id",requireLogin,(req,res) => {
    res.render("room");
});

io.on("connection",(socket) => {
    socket.on("join",(roomId) => {
        socket.join(roomId);
        socket.to(roomId).emit("user-joined",socket.id);
    });
    socket.on("signal",({to,data}) => {
        io.to(to).emit("signal",{from: socket.id,data});
    });
    socket.on("disconnecting",() => {
        socket.rooms.forEach((r) => socket.to(r).emit("user-left",socket.id));
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT,() => {
    console.log("Server is listening to port " + PORT);
}); 