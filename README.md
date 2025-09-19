# DebtManage Backend

Investment platform backend with MongoDB and Razorpay integration.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
PORT=5000
```

3. Start server:
```bash
npm start
```

## API Endpoints

- `POST /api/register` - User registration
- `POST /api/login` - User login
- `GET /api/user-profile` - Get user profile
- `POST /create-order` - Create Razorpay order
- `POST /verify-payment` - Verify payment