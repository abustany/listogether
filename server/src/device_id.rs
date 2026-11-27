use anyhow::{anyhow, Context, Result};
use base64::Engine as _;
use ecdsa::signature::{Signer as _, Verifier as _};
use rand::RngCore;

type Curve = p256::NistP256;
type Key = ecdsa::SigningKey<Curve>;
type Signature = ecdsa::Signature<Curve>;

pub const RAW_DEVICE_ID_LEN: usize = 16; // bytes
const SIGNATURE_LEN: usize = 64; // bytes

pub struct DeviceID(Vec<u8>);

#[derive(Clone)]
pub struct SigningKey(Key);

impl DeviceID {
    pub fn new(signing_key: &SigningKey) -> Self {
        // 1. Generate a random ID
        let mut random_data = [0u8; RAW_DEVICE_ID_LEN];
        rand::thread_rng().fill_bytes(&mut random_data);

        // 2. Sign it so that we make sure we emitted this ID
        let sig: Signature = signing_key.as_ref().sign(&random_data);
        let sig_bytes = sig.to_bytes();
        assert_eq!(SIGNATURE_LEN, sig_bytes.len());

        DeviceID([sig_bytes.as_slice(), &random_data].concat())
    }

    pub fn from_string(signing_key: &SigningKey, s: &str) -> Result<Self> {
        let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(s)?;
        if bytes.len() != SIGNATURE_LEN + RAW_DEVICE_ID_LEN {
            return Err(anyhow!("invalid ID size"));
        }

        let sig: Signature = Signature::from_bytes((&bytes[0..SIGNATURE_LEN]).into())
            .context("error parsing signature")?;
        signing_key
            .as_ref()
            .as_ref()
            .verify(&bytes[SIGNATURE_LEN..], &sig)
            .context("error validating signature")?;

        Ok(DeviceID(bytes))
    }

    pub fn raw(&self) -> &[u8] {
        &self.0[SIGNATURE_LEN..]
    }

    pub fn encode(data: &[u8]) -> String {
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(data)
    }
}

impl std::fmt::Display for DeviceID {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&DeviceID::encode(&self.0))
    }
}

impl SigningKey {
    pub fn from_string(s: &str) -> Result<Self> {
        let sig_bytes = base64::engine::general_purpose::STANDARD
            .decode(s)
            .context("error decoding base64")?;
        Self::from_bytes(&sig_bytes)
    }

    fn from_bytes(bytes: &[u8]) -> Result<Self> {
        let sig = ecdsa::SigningKey::from_bytes(bytes.into()).context("error parsing key")?;
        Ok(SigningKey(sig))
    }

    pub fn generate() -> Self {
        SigningKey(Key::random(&mut rand::thread_rng()))
    }

    pub fn to_base64(&self) -> String {
        base64::engine::general_purpose::STANDARD.encode(self.as_ref().to_bytes())
    }
}

impl AsRef<Key> for SigningKey {
    fn as_ref(&self) -> &Key {
        &self.0
    }
}

#[cfg(test)]
mod test {
    use super::{DeviceID, SigningKey};

    #[test]
    fn test_device_id() {
        let signing_key = SigningKey::generate();
        let device_id = DeviceID::new(&signing_key);
        let device_id_str = device_id.to_string();
        assert!(DeviceID::from_string(&signing_key, &device_id_str).is_ok());

        let other_signing_key = SigningKey::generate();
        assert!(DeviceID::from_string(&other_signing_key, &device_id_str).is_err());
    }

    #[test]
    fn test_signing_key() {
        let signing_key = SigningKey::generate();
        let device_id_str = DeviceID::new(&signing_key).to_string();

        let signing_key_str = signing_key.to_base64();
        let parsed_signing_key = SigningKey::from_string(&signing_key_str);
        assert!(parsed_signing_key.is_ok());

        let parsed_signing_key = parsed_signing_key.unwrap();
        assert!(DeviceID::from_string(&parsed_signing_key, &device_id_str).is_ok());
    }
}
