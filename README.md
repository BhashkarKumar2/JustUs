# JustUs V2

**JustUs V2** is a modern, full-stack real-time chat application designed to provide seamless communication with advanced features like AI integration and secure messaging. Built with the MERN stack and enhanced with real-time capabilities using Socket.io.

## Features

- **Real-time Messaging**: Instant text, voice, and media sharing.
- **AI Integration**: Powered by Google Generative AI and OpenAI for smart responses and assistance.
- **Real-time Translation**: Instant message translation to break language barriers.
- **Secure Authentication**: Robust user authentication using JWT and bcrypt.
- **Media Support**: Easy file uploads and sharing.
- **Responsive Design**: Mobile-first UI built with TailwindCSS.
- **Voice Capabilities**: Integrated Text-to-Speech and voice features.

##  Tech Stack

### Frontend
- **Framework**: [React](https://reactjs.org/) (Vite)
- **Styling**: [TailwindCSS](https://tailwindcss.com/)
- **State Management & Logic**: React Hooks
- **Real-time**: Socket.io Client

### Backend
- **Runtime**: [Node.js](https://nodejs.org/)
- **Framework**: [Express.js](https://expressjs.com/)
- **Database**: [MongoDB](https://www.mongodb.com/) (Mongoose)
- **Real-time**: Socket.io
- **Security**: Helmet, Rate Limit, CORS, JWT
- **AI**: Google Generative AI, OpenAI SDK

##  Prerequisites

Before you begin, ensure you have the following installed:
- Node.js (v18.0.0 or higher)
- npm (v9.0.0 or higher)
- MongoDB (Local or AtlasURI)

## 📦 Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd JustUs-V2
```

### 2. Install Dependencies
Install dependencies for the root, backend, and frontend with a single command:
```bash
npm run install-all
```

*Note: This script runs `npm install` in the root, `backend`, and `frontend` directories.*

### 3. Environment Setup
Create a `.env` file in the `backend` directory (see Prerequisites or check `backend/.env.example` if available) with your credentials.

## 🏃‍♂️ Running the Application

Start both the backend and frontend servers concurrently:
```bash
npm start
```

- **Backend**: http://localhost:5000
- **Frontend**: http://localhost:5173

You can also run them individually if needed:
- **Backend only**: `npm run server`
- **Frontend only**: `npm run client`

## Contributing

Contributions are welcome! Please perform pull requests for any bug fixes or feature additions.

## License

This project is licensed under the ISC License.
