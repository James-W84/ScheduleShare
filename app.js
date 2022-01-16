require("dotenv").config();
const express = require("express");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const findOrCreate = require("mongoose-findorcreate");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { redirect } = require("express/lib/response");

const app = express();
app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SECRET_TEXT,
    resave: true,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

const dbURI = `mongodb+srv://${process.env.DB_NAME}:${process.env.DB_PASS}@userdb.szxrc.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
mongoose
  .connect(dbURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then((result) => {
    app.listen(process.env.PORT || 3000, function () {
      console.log("Server started on port 3000");
      console.log("Successfully connected to DB");
    });
  })
  .catch((err) => console.log(err));

const userSchema = new mongoose.Schema({
  name: String,
  googleId: String,
  friends: Array,
  groups: Array,
  classes: Array,
});

// const classSchema = new mongoose.Schema({
//   name: { type: String, required: true },
//   startTime: { type: Number, required: true },
//   endTime: { type: Number, required: true },
//   days: { type: String, required: true },
//   room: String,
//   instructor: String,
// });

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);
// const Class = new mongoose.model("Class", classSchema);

passport.use(User.createStrategy());

passport.serializeUser(function (user, done) {
  done(null, user.id);
});
passport.deserializeUser(function (id, done) {
  User.findById(id, function (err, user) {
    done(err, user);
  });
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/scheduleshare",
    },
    function (accessToken, refreshToken, profile, cb) {
      User.findOrCreate(
        { googleId: profile.id, name: profile.displayName },
        function (err, user) {
          return cb(err, user);
        }
      );
    }
  )
);

app.get("/", function (req, res) {
  res.render("home");
});

app.get("/dashboard", function (req, res) {
  if (req.isAuthenticated()) {
    res.render("schedule", { user: req.user });
  } else {
    res.redirect("/");
  }
});

app.post("/dashboard", function (req, res) {
  let start = req.body.startTime;
  let end = req.body.endTime;
  let weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  let days = [];
  let stringified = JSON.stringify(req.body);
  weekdays.forEach((element) => {
    if (stringified.includes(element)) {
      days.push(element);
    }
  })
  req.body.startTime = parseInt(start.substring(0, 2)) * 60 + parseInt(start.substring(3));
  req.body.endTime = parseInt(end.substring(0, 2)) * 60 + parseInt(end.substring(3));
  req.body.days = days;
  User.updateOne({ _id: req.user._id }, { $push: { classes: req.body } })
    .then((result) => {
      console.log(result);
    })
    .catch((err) => console.log(err));
    res.redirect("/dashboard");
});

app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile"] })
);

app.get(
  "/auth/google/scheduleshare",
  passport.authenticate("google", { failureRedirect: "/" }),
  function (req, res) {
    res.redirect("/dashboard");
  }
);

app.get("/logout", function (req, res) {
  req.logout();
  res.render("logout");
});
