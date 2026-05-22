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

    console.log("MongoDB connected successfully");
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
  }
}

run();

app.get("/", (req, res) => res.send("IdeaVault server running..."));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
