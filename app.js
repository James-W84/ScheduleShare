require("dotenv").config();
const express = require("express");
const url = require("url");
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
  username_1: { type: String, sparse: true, unique: false },
  username: { type: String, sparse: true, unique: false },
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
      callbackURL: process.env.CALLBACK_URL,
    },
    function (accessToken, refreshToken, profile, cb) {
      User.findOrCreate(
        {
          googleId: profile.id,
          name: profile._json.name,
          username: profile.id,
          username_1: profile.id,
        },
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

// Recursively generate new colors
function generateColors(num, arr, step = 1, n = 1) {
  if (n > num) {
    return;
  } else {
    let r = n % 6;
    switch (r) {
      case 1:
        arr.push(`0, 0, ${255 / step}`);
        break;
      case 2:
        arr.push(`${255 / step}, 0, 0`);
        break;
      case 3:
        arr.push(`0, ${255 / step}, 0`);
        break;
      case 4:
        arr.push(`${255 / step}, ${255 / step}, 0`);
        break;
      case 5:
        arr.push(`${255 / step}, 0, ${255 / step}`);
        break;
      case 0:
        arr.push(`0, ${255 / step}, ${255 / step}`);
        step++;
        break;
      default:
        break;
    }
    generateColors(num, arr, step, n + 1);
  }
}

app.get("/dashboard", function (req, res) {
  if (req.isAuthenticated()) {
    let colors = [];
    const numClasses = req.user.classes.length;
    generateColors(numClasses, colors);
    res.render("schedule", { user: req.user, colors: colors, viewOnly: false });
  } else {
    res.redirect("/auth/google");
  }
});

app.post("/dashboard", function (req, res) {
  let start = req.body.startTime;
  let end = req.body.endTime;
  let weekdays = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  let days = [];
  let stringified = JSON.stringify(req.body);
  weekdays.forEach((element) => {
    if (stringified.includes(element)) {
      days.push(element);
    }
  });
  req.body.numStartTime =
    parseInt(start.substring(0, 2)) * 60 + parseInt(start.substring(3));
  req.body.numEndTime =
    parseInt(end.substring(0, 2)) * 60 + parseInt(end.substring(3));
  if (req.body.numStartTime >= 780) {
    let min = req.body.numStartTime % 60;
    if (min < 10) {
      min = "0" + min;
    }
    req.body.startTime = `${
      Math.floor(req.body.numStartTime / 60) - 12
    }:${min} PM`;
  } else if (req.body.numStartTime >= 720) {
    req.body.startTime += " PM";
  } else {
    req.body.startTime += " AM";
  }
  if (req.body.numEndTime >= 780) {
    let min = req.body.numEndTime % 60;
    if (min < 10) {
      min = "0" + min;
    }
    req.body.endTime = `${Math.floor(req.body.numEndTime / 60) - 12}:${min} PM`;
  } else if (req.body.numEndTime >= 720) {
    req.body.endTime += " PM";
  } else {
    req.body.endTime += " AM";
  }
  req.body.days = days;
  User.updateOne({ _id: req.user._id }, { $push: { classes: req.body } })
    .then((result) => {
      console.log(result);
    })
    .catch((err) => console.log(err));
  setTimeout(() => res.redirect("/dashboard"), 500);
});

app.post("/delete", function (req, res) {
  User.updateOne(
    { name: req.user.name },
    { $pull: { classes: { className: req.body.className } } }
  )
    .then((result) => {
      console.log(result);
    })
    .catch((err) => console.log(err));
  res.redirect("/dashboard");
});

app.post("/edit", function (req, res) {
  console.log(req.body);

  User.updateOne(
    { name: req.user.name },
    { $pull: { classes: { className: req.body.oldClassName } } }
  )
    .then((result) => {
      console.log(result);
    })
    .catch((err) => console.log(err));

  res.redirect(307, "/dashboard");
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

app.get("/friends", function (req, res) {
  if (req.isAuthenticated()) {
    const friendArr = req.user.friends;
    let requests = [];
    let friends = [];
    friendArr.forEach((element) => {
      if (element.status === "request-from") {
        requests.push(element);
      } else if (element.status === "friend") {
        friends.push(element);
      }
    });
    res.render("friends", {
      user: req.user,
      friendRequests: requests,
      friends: friends,
    });
  } else {
    res.redirect("/auth/google");
  }
});

app.post("/add-friend", function (req, res) {
  User.findOne({ username: req.body.friendId }, function (err, user) {
    if (err) {
      console.log(err);
      res.redirect("/friends");
    } else {
      let request = {
        name: req.user.name,
        username: req.user.username,
        status: "request-from",
      };
      let status = {
        name: user.name,
        username: user.username,
        status: "request-to",
      };
      User.updateOne(user, { $push: { friends: request } }).catch((err) =>
        console.log(err)
      );
      User.updateOne(
        { username: req.user.username },
        { $push: { friends: status } }
      ).catch((err) => console.log(err));
      res.redirect("/friends");
    }
  });
});

app.post("/accept", function (req, res) {
  User.update(
    { username: req.user.username, "friends.username": req.body.reqId },
    { $set: { "friends.$.status": "friend" } },
    function (err) {
      console.log(err);
    }
  );
  User.update(
    { username: req.body.reqId, "friends.username": req.user.username },
    { $set: { "friends.$.status": "friend" } },
    function (err) {
      console.log("dab");
    }
  );
  res.redirect("/friends");
});

app.post("/decline", function (req, res) {
  User.updateOne(
    { username: req.user.username },
    { $pull: { friends: { username: req.body.reqId } } }
  ).catch((err) => console.log(err));
  User.updateOne(
    { username: req.body.reqId },
    { $pull: { friends: { username: req.user.username } } }
  ).catch((err) => console.log(err));
  res.redirect("/friends");
});

app.get("/profile", function (req, res) {
  let isFriend = false;
  const queryObject = url.parse(req.url, true).query;
  req.user.friends.forEach((element) => {
    if (element.username === queryObject.user) {
      isFriend = true;
    }
  });
  if (isFriend) {
    let colors = [];
    User.find({ username: queryObject.user }, function (err, user) {
      if (err) {
        console.log(err);
      } else {
        user = user[0];
        const numClasses = user.classes.length;
        generateColors(numClasses, colors);
        res.render("schedule", { user: user, colors: colors, viewOnly: true });
      }
    });
  } else {
    res.redirect("/");
  }
});
