# IdeaVault Server

Backend API for the **IdeaVault**, built with **Node.js**, **Express.js**, and **MongoDB**.
It handles authentication, Google OAuth login, idea management, comments, and like functionality.

---

## Live API

```bash
https://ideavault-server-liart.vercel.app
```

---

# Features

- JWT Authentication
- Google OAuth Login
- CRUD Operations for Ideas
- Comment System
- Like / Unlike System
- User Profile Management
- Search, Filter, and Sorting Support
- RESTful API Architecture

---

# Tech Stack

- Node.js
- Express.js
- MongoDB
- JWT
- Google OAuth
- Vercel

---

# Project Structure

```bash
ideavault-server
├─ .env
├─ index.js
├─ package-lock.json
├─ package.json
├─ README.md
└─ vercel.json
```

---

# Installation & Setup

## 1. Clone the Repository

```bash
git clone https://github.com/md-saju-ahmed/ideavault-server.git
cd ideavault-server
```

## 2. Install Dependencies

```bash
npm install
```

## 3. Configure Environment Variables

Create a `.env` file in the root directory:

```env
PORT=5000

MONGODB_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

CLIENT_URL=http://localhost:5173
AUTH_URL=http://localhost:5000
```

## 4. Start the Server

```bash
npm start
```

Server will run on:

```bash
http://localhost:5000
```

---

# API Endpoints

## Authentication

| Method | Endpoint                | Description           |
| ------ | ----------------------- | --------------------- |
| POST   | `/auth/register`        | Register a new user   |
| POST   | `/auth/login`           | Login user            |
| GET    | `/auth/google`          | Google OAuth login    |
| GET    | `/auth/google/callback` | Google OAuth callback |

---

## Users

| Method | Endpoint    | Description         |
| ------ | ----------- | ------------------- |
| GET    | `/users/me` | Get current user    |
| PATCH  | `/users/me` | Update current user |

---

## Ideas

| Method | Endpoint          | Description                |
| ------ | ----------------- | -------------------------- |
| GET    | `/ideas`          | Get all ideas              |
| GET    | `/ideas/my`       | Get logged-in user's ideas |
| GET    | `/ideas/:id`      | Get single idea            |
| POST   | `/ideas`          | Create new idea            |
| PATCH  | `/ideas/:id`      | Update idea                |
| DELETE | `/ideas/:id`      | Delete idea                |
| POST   | `/ideas/:id/like` | Like or unlike an idea     |

---

## Comments

| Method | Endpoint            | Description         |
| ------ | ------------------- | ------------------- |
| GET    | `/comments/my`      | Get user's comments |
| GET    | `/comments/:ideaId` | Get idea comments   |
| POST   | `/comments`         | Add comment         |
| PATCH  | `/comments/:id`     | Update comment      |
| DELETE | `/comments/:id`     | Delete comment      |

---

# Query Parameters

## `GET /ideas`

| Parameter  | Description                     |
| ---------- | ------------------------------- |
| `search`   | Search ideas by title           |
| `category` | Filter ideas by category        |
| `sort`     | `newest`, `oldest`, `mostLiked` |
