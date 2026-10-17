const express = require('express');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    data: { status: 'ok' },
    message: 'OK',
  });
});

module.exports = router;
