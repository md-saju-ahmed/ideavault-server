const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());

// MongoDB
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const db = client.db("ideavault");
const userCollection = db.collection("users");
const ideaCollection = db.collection("ideas");
const commentCollection = db.collection("comments");

// JWT Middleware
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Unauthorized" });

  const token = authHeader.split(" ")[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(403).json({ message: "Forbidden" });
  }
};

// Google OAuth
app.get("/auth/google", (req, res) => {
  const callbackURL = `${process.env.AUTH_URL}/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackURL,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get("/auth/google/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect(`${process.env.CLIENT_URL}/login?error=google_failed`);
  }

  try {
    const callbackURL = `${process.env.AUTH_URL}/auth/google/callback`;

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: callbackURL,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("Token exchange failed:", tokenData);
      return res.redirect(
        `${process.env.CLIENT_URL}/login?error=google_failed`,
      );
    }

    const userRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      },
    );

    const googleUser = await userRes.json();
    const { email, name, picture } = googleUser;

    if (!email) {
      return res.redirect(
        `${process.env.CLIENT_URL}/login?error=google_failed`,
      );
    }

    let user = await userCollection.findOne({ email });

    if (!user) {
      const result = await userCollection.insertOne({
        name: name || "",
        email,
        password: null,
        photoURL: picture || "",
      });
      user = await userCollection.findOne({ _id: result.insertedId });
    } else if (!user.photoURL && picture) {
      await userCollection.updateOne(
        { _id: user._id },
        { $set: { photoURL: picture } },
      );
      user.photoURL = picture;
    }

    const token = jwt.sign(
      {
        id: user._id.toString(),
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    const { password: _pw, ...safeUser } = user;

    const params = new URLSearchParams({
      token,
      user: JSON.stringify({ ...safeUser, _id: safeUser._id.toString() }),
    });

    res.redirect(`${process.env.CLIENT_URL}/auth/callback?${params}`);
  } catch (err) {
    console.error("Google callback error:", err);
    res.redirect(`${process.env.CLIENT_URL}/login?error=google_failed`);
  }
});

// server run function
async function run() {
  try {
    await client.connect();

    // Auth (email/password)
    app.post("/auth/register", async (req, res) => {
      try {
        const existing = await userCollection.findOne({
          email: req.body.email,
        });
        if (existing)
          return res.status(400).json({ message: "User already exists" });

        const result = await userCollection.insertOne({
          name: req.body.name,
          email: req.body.email,
          password: req.body.password,
          photoURL: req.body.photoURL || "",
        });
        res.json(result);
      } catch {
        res.status(500).json({ message: "Registration failed" });
      }
    });

    app.post("/auth/login", async (req, res) => {
      try {
        const { email, password } = req.body;
        if (!email || !password)
          return res
            .status(400)
            .json({ message: "Email and password are required" });

        const user = await userCollection.findOne({ email });
        if (!user)
          return res.status(404).json({ message: "Invalid email or password" });
        if (!user.password)
          return res
            .status(400)
            .json({ message: "This account uses Google login" });
        if (user.password !== password)
          return res.status(401).json({ message: "Invalid email or password" });

        const token = jwt.sign(
          {
            id: user._id.toString(),
            email: user.email,
          },
          process.env.JWT_SECRET,
          { expiresIn: "7d" },
        );
        const { password: _pw, ...safeUser } = user;
        res.json({ token, user: safeUser });
      } catch {
        res.status(500).json({ message: "Login failed" });
      }
    });

    // Users
    app.get("/users/me", verifyToken, async (req, res) => {
      const user = await userCollection.findOne({
        _id: new ObjectId(req.user.id),
      });
      res.json(user);
    });

    app.patch("/users/me", verifyToken, async (req, res) => {
      await userCollection.updateOne(
        { _id: new ObjectId(req.user.id) },
        {
          $set: {
            name: req.body.name,
            photoURL: req.body.photoURL,
          },
        },
      );
      const updatedUser = await userCollection.findOne({
        _id: new ObjectId(req.user.id),
      });
      res.json(updatedUser);
    });

    // Ideas
    app.get("/ideas", async (req, res) => {
      try {
        const {
          search,
          category,
          page = 1,
          limit = 9,
          sort = "newest",
        } = req.query;

        const filter = {};

        if (search?.trim()) {
          filter.ideaTitle = {
            $regex: search.trim(),
            $options: "i",
          };
        }

        if (category && category !== "All") {
          filter.category = category;
        }

        let sortQuery = { createdAt: -1 };

        if (sort === "oldest") {
          sortQuery = { createdAt: 1 };
        }

        if (sort === "mostLiked") {
          sortQuery = { "likes.count": -1 };
        }

        const skip = (Number(page) - 1) * Number(limit);

        const total = await ideaCollection.countDocuments(filter);

        const data = await ideaCollection
          .find(filter)
          .sort(sortQuery)
          .skip(skip)
          .limit(Number(limit))
          .toArray();

        res.json({
          data,
          total,
          page: Number(page),
          limit: Number(limit),
        });
      } catch {
        res.status(500).json({
          message: "Failed to fetch ideas",
        });
      }
    });

    app.get("/ideas/my", verifyToken, async (req, res) => {
      const ideas = await ideaCollection
        .find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .toArray();
      res.json(ideas);
    });

    app.get("/ideas/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res.status(400).json({ message: "Invalid ID" });

        const idea = await ideaCollection.findOne({ _id: new ObjectId(id) });
        if (!idea) return res.status(404).json({ message: "Idea not found" });

        const author = await userCollection.findOne({
          _id: new ObjectId(idea.userId),
        });
        res.json({
          ...idea,
          author: author
            ? {
                name: author.name,
                email: author.email,
                photoURL: author.photoURL,
              }
            : null,
        });
      } catch (err) {
        res.status(500).json({
          message: "Failed to fetch idea",
          error: err.message,
        });
      }
    });

    app.post("/ideas", verifyToken, async (req, res) => {
      try {
        const idea = {
          userId: req.user.id,
          ideaTitle: req.body.ideaTitle,
          shortDescription: req.body.shortDescription,
          detailedDescription: req.body.detailedDescription,
          category: req.body.category,
          imageURL: req.body.imageURL || "",
          targetAudience: req.body.targetAudience || "",
          tags: req.body.tags || [],
          estimatedBudget: req.body.estimatedBudget || 0,
          problemStatement: req.body.problemStatement || "",
          proposedSolution: req.body.proposedSolution || "",
          likes: { count: 0, likedBy: [] },
          commentsCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        const result = await ideaCollection.insertOne(idea);
        res.json(result);
      } catch {
        res.status(500).json({ message: "Failed to create idea" });
      }
    });

    app.patch("/ideas/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res.status(400).json({ message: "Invalid ID" });

        const idea = await ideaCollection.findOne({ _id: new ObjectId(id) });
        if (!idea) return res.status(404).json({ message: "Idea not found" });
        if (idea.userId !== req.user.id)
          return res.status(403).json({ message: "Not allowed" });

        const allowed = [
          "ideaTitle",
          "shortDescription",
          "detailedDescription",
          "category",
          "imageURL",
          "targetAudience",
          "tags",
          "estimatedBudget",
          "problemStatement",
          "proposedSolution",
        ];
        const updateData = {};
        allowed.forEach((f) => {
          if (req.body[f] !== undefined) updateData[f] = req.body[f];
        });
        updateData.updatedAt = new Date();

        await ideaCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData },
        );
        const updated = await ideaCollection.findOne({ _id: new ObjectId(id) });
        res.json(updated);
      } catch {
        res.status(500).json({ message: "Failed to update idea" });
      }
    });

    app.delete("/ideas/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res.status(400).json({ message: "Invalid ID" });

        const idea = await ideaCollection.findOne({ _id: new ObjectId(id) });
        if (!idea) return res.status(404).json({ message: "Idea not found" });
        if (idea.userId !== req.user.id)
          return res.status(403).json({ message: "Not allowed" });

        await ideaCollection.deleteOne({ _id: new ObjectId(id) });
        await commentCollection.deleteMany({ ideaId: id });
        res.json({ success: true });
      } catch {
        res.status(500).json({ message: "Failed to delete idea" });
      }
    });

    // Like/Unlike
    app.post("/ideas/:id/like", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const userId = req.user.id;
        if (!ObjectId.isValid(id))
          return res.status(400).json({ message: "Invalid ID" });

        const idea = await ideaCollection.findOne({ _id: new ObjectId(id) });
        if (!idea) return res.status(404).json({ message: "Idea not found" });

        const likedBy = idea.likes?.likedBy || [];
        const alreadyLiked = likedBy.includes(userId);
        const update = alreadyLiked
          ? {
              $inc: { "likes.count": -1 },
              $pull: { "likes.likedBy": userId },
            }
          : {
              $inc: { "likes.count": 1 },
              $addToSet: { "likes.likedBy": userId },
            };

        await ideaCollection.updateOne({ _id: new ObjectId(id) }, update);
        const updated = await ideaCollection.findOne({ _id: new ObjectId(id) });
        res.json({
          likes: updated.likes.count,
          liked: !alreadyLiked,
        });
      } catch {
        res.status(500).json({ message: "Like failed" });
      }
    });

    console.log("MongoDB connected successfully");
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
  }
}

run();

app.get("/", (req, res) => res.send("IdeaVault server running..."));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
