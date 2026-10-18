import mongoose from 'mongoose';

const documentFileSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    documentType: { type: String, enum: ['quotation', 'invoice'], required: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    path: { type: String, required: true },
    version: { type: Number, required: true },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

documentFileSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

const DocumentFile = mongoose.model('DocumentFile', documentFileSchema);
export default DocumentFile;
