import { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera, faTrashCan, faUser } from "@fortawesome/free-solid-svg-icons";
import {
  getApiErrorMessage,
  getProfilePictureUrl,
  removeUserProfilePicture,
  updateCurrentSessionUser,
  uploadUserProfilePicture,
} from "../lib/records";
import type { UserAccount } from "../lib/records";

interface ProfilePhotoControlProps {
  userId: string;
  fullName: string;
  profilePicture: string;
  onUpdated: (user: UserAccount) => void;
}

function updateSessionIfSelf(userId: string, user: UserAccount) {
  if (userId === "me") {
    updateCurrentSessionUser(user);
    return;
  }
  try {
    const currentUser = JSON.parse(sessionStorage.getItem("user") ?? "{}") as { id?: string };
    if (currentUser.id === userId) updateCurrentSessionUser(user);
  } catch {
    return;
  }
}

function ProfilePhotoControl({
  userId,
  fullName,
  profilePicture,
  onUpdated,
}: ProfilePhotoControlProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const savePicture = async (file: File) => {
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be 2 MB or smaller.");
      return;
    }

    setBusy(true);
    try {
      const imageData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") resolve(reader.result);
          else reject(new Error("Unable to read this image file."));
        };
        reader.onerror = () => reject(new Error("Unable to read this image file."));
        reader.readAsDataURL(file);
      });
      const updatedUser = await uploadUserProfilePicture(userId, imageData);
      updateSessionIfSelf(userId, updatedUser);
      onUpdated(updatedUser);
    } catch (uploadError: unknown) {
      setError(getApiErrorMessage(uploadError, "Unable to save this profile picture."));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const clearPicture = async () => {
    setBusy(true);
    setError("");
    try {
      const updatedUser = await removeUserProfilePicture(userId);
      updateSessionIfSelf(userId, updatedUser);
      onUpdated(updatedUser);
    } catch (removeError: unknown) {
      setError(getApiErrorMessage(removeError, "Unable to remove this profile picture."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profile-photo-control">
      <span className="profile-photo-preview">
        {profilePicture ? (
          <img src={getProfilePictureUrl(profilePicture)} alt={`${fullName}'s profile`} />
        ) : (
          <FontAwesomeIcon icon={faUser} aria-hidden="true" />
        )}
      </span>
      <div className="profile-photo-actions">
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label={`Choose profile photo for ${fullName}`}
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void savePicture(file);
          }}
        />
        <button
          type="button"
          className="users-button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          <FontAwesomeIcon icon={faCamera} aria-hidden="true" />
          {busy ? "Saving…" : profilePicture ? "Replace photo" : "Upload photo"}
        </button>
        {profilePicture && (
          <button
            type="button"
            className="users-button"
            onClick={() => void clearPicture()}
            disabled={busy}
          >
            <FontAwesomeIcon icon={faTrashCan} aria-hidden="true" /> Remove
          </button>
        )}
        <small>PNG, JPEG or WebP · maximum 2 MB</small>
        {error && <span role="alert" className="profile-photo-error">{error}</span>}
      </div>
    </div>
  );
}

export default ProfilePhotoControl;
