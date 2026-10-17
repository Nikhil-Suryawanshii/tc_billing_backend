function documentResponse(document) {
  const data = typeof document.toObject === 'function' ? document.toObject() : { ...document };
  if (data._id !== undefined && data._id !== null) {
    data.id = String(data._id);
  } else if (data.id !== undefined && data.id !== null) {
    data.id = String(data.id);
  }
  return data;
}

module.exports = documentResponse;
