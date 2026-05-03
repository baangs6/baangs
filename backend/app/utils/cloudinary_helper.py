import cloudinary
import cloudinary.uploader
import base64
import io
from ..config import settings


def configure_cloudinary():
    if settings.CLOUDINARY_CLOUD_NAME:
        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
            secure=True
        )


async def upload_image_base64(base64_data: str, folder: str = "baangs") -> str:
    """
    Upload a base64 image to Cloudinary and return the URL.
    If Cloudinary is not configured, returns the base64 string as-is.
    """
    if not settings.CLOUDINARY_CLOUD_NAME:
        return base64_data  # fallback: store base64
    configure_cloudinary()

    # Strip data URL prefix if present
    if "," in base64_data:
        base64_data = base64_data.split(",")[1]

    result = cloudinary.uploader.upload(
        f"data:image/jpeg;base64,{base64_data}",
        folder=folder,
        resource_type="image"
    )
    return result["secure_url"]


async def upload_image_bytes(image_bytes: bytes, folder: str = "baangs") -> str:
    """Upload raw image bytes to Cloudinary."""
    if not settings.CLOUDINARY_CLOUD_NAME:
        return base64.b64encode(image_bytes).decode()
    configure_cloudinary()
    result = cloudinary.uploader.upload(
        image_bytes,
        folder=folder,
        resource_type="image"
    )
    return result["secure_url"]
