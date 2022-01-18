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
const e = require("express");
const { join } = require("path");

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

const groupSchema = new mongoose.Schema({
  admin: {
    id: { type: String, required: true },
    name: { type: String, required: true },
  },
  name: String,
  members: Array,
  joinRequests: Array,
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
const Group = new mongoose.model("Group", groupSchema);
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
  let redirected = false;
  req.user.friends.forEach((element) => {
    if (element.username === req.body.friendId) {
      redirected = true;
      res.redirect("/friends");
    }
  });
  if (!redirected) {
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
  }
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
      console.log(err);
    }
  );
  res.redirect("/friends");
});

app.post("/decline", function (req, res) {
  User.updateOne(
    { username: req.user.username },
    { $pull: { friends: { username: req.body.reqId, status: "request-from" } } }
  ).catch((err) => console.log(err));
  User.updateOne(
    { username: req.body.reqId },
    {
      $pull: { friends: { username: req.user.username, status: "request-to" } },
    }
  ).catch((err) => console.log(err));
  res.redirect("/friends");
});

app.get("/profile", function (req, res) {
  if (req.isAuthenticated()) {
    let isFriend = false;
    const queryObject = url.parse(req.url, true).query;
    req.user.friends.forEach((element) => {
      if (element.username === queryObject.user) {
        isFriend = true;
      }
    });
    if (isFriend) {
      let colors = [];
      User.findOne({ username: queryObject.user }, function (err, user) {
        if (err) {
          console.log(err);
        } else {
          const numClasses = user.classes.length;
          generateColors(numClasses, colors);
          res.render("schedule", {
            user: user,
            colors: colors,
            viewOnly: true,
          });
        }
      });
    } else {
      res.redirect("/dashboard");
    }
  } else {
    res.redirect("/auth/google");
  }
});

app.get("/groups", function (req, res) {
  const userGroups = req.user.groups;
  res.render("groups", { groups: userGroups });
});

app.post("/create-group", function (req, res) {
  let newGroup = new Group({
    admin: {
      id: req.user.username,
      name: req.user.name,
    },
    name: req.body.groupName,
  });
  newGroup.save(function (err, group) {
    if (err) console.log(err);
    else {
      console.log(group);
      User.update(
        { username: req.user.username },
        { $push: { groups: { groupId: group._id.toHexString(), groupName: group.name } } }
      )
        .then((result) => {
          console.log(result);
        })
        .catch((err) => {
          console.log(err);
        });
    }
  });
  res.redirect("/groups");
});

app.post("/request-join", function (req, res) {
  let redirect = false;
  req.user.groups.forEach((element) => {
    if (element.groupId === req.body.groupId) {
      res.redirect("/groups");
      redirect = true;
    }
  });
  Group.findOne({ _id: req.body.groupId }, function (err, group) {
    if (err) {
      console.log(err);
      res.redirect("/groups");
    } else {
      group.joinRequests.forEach((element) => {
        if ((element.id = req.user.username)) {
          res.redirect("/groups");
          redirect = true;
        }
      });
      if (!redirect) {
        Group.updateOne(group, {
          $push: {
            joinRequests: { name: req.user.name, id: req.user.username },
          },
        }).catch((err) => console.log(err));
        console.log(group);
        res.redirect("/groups");
      }
    }
  });
});

app.get("/group", function (req, res) {
  if (req.isAuthenticated()) {
    let isInGroup = false;
    const queryObject = url.parse(req.url, true).query;
    req.user.groups.forEach((element) => {
      if (element.groupId === queryObject.id) isInGroup = true;
    });
    if (isInGroup) {
      Group.findOne({ _id: queryObject.id }, function (err, group) {
        if (err) console.log(err);
        else {
          let isAdmin = req.user.username === group.admin.id;
          let groupMembers = [];
          User.findOne({ username: group.admin.id }, function (err, user) {
            if (err) console.log(err);
            else {
              groupMembers.push(user);
              let memberIds = [];
              group.members.forEach((element) => {
                memberIds.push(element.id);
              });
              User.find(
                { username: { $in: memberIds } },
                function (err, result) {
                  if (err) console.log(err);
                  else {
                    groupMembers = groupMembers.concat(result);
                    colors = [];
                    const numMembers = groupMembers.length;
                    generateColors(numMembers, colors);
                    res.render("group", {
                      group: group,
                      members: groupMembers,
                      isAdmin: isAdmin,
                      colors: colors,
                    });
                  }
                }
              );
            }
          });
        }
      });
    } else {
      res.redirect("/groups");
    }
  } else {
    res.redirect("/auth/google");
  }
});

app.post("/accept-join", function (req, res) {
  Group.updateOne({ _id: req.body.groupId },
  {$push: {members: {name: req.body.name, id: req.body.reqId}}})
    .catch((err) => console.log(err));
  Group.updateOne({ _id: req.body.groupId }, {$pull: {joinRequests: {id: req.body.reqId}}})
    .catch((err) => console.log(err));
  User.updateOne({username: req.body.reqId}, {$push: {groups: {groupId: req.body.groupId, groupName: req.body.groupName}}})
    .catch((err) => console.log(err));
  res.redirect(`/group?id=${req.body.groupId}`);
});

app.post("/decline-join", function(req, res) {
  Group.updateOne({ _id: req.body.groupId }, {$pull: {joinRequests: {id: req.body.reqId}}})
    .catch((err) => console.log(err));
  res.redirect(`/group?id=${req.body.groupId}`);
})