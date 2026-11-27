use std::str::FromStr;

use anyhow::{bail, Context, Result};
use base64::Engine as _;
use ecdsa::signature::{Signer as _, Verifier as _};
use rand::RngCore;

type Curve = p256::NistP256;
type Key = ecdsa::SigningKey<Curve>;
type Signature = ecdsa::Signature<Curve>;

pub const RAW_DEVICE_ID_LEN: usize = 16; // bytes
const SIGNATURE_LEN: usize = 64; // bytes
const KEY_LEN: usize = 32; // bytes

pub struct DeviceID(Vec<u8>);

#[derive(Clone)]
pub struct SigningKey(Key);

impl DeviceID {
    pub fn new(signing_key: &SigningKey) -> Self {
        let mut random_data = [0u8; RAW_DEVICE_ID_LEN];
        rand::thread_rng().fill_bytes(&mut random_data);

        // The signature proves that this server created the ID.
        let sig: Signature = signing_key.0.sign(&random_data);
        let sig_bytes = sig.to_bytes();
        assert_eq!(SIGNATURE_LEN, sig_bytes.len());

        DeviceID([sig_bytes.as_slice(), &random_data].concat())
    }

    pub fn from_string(signing_key: &SigningKey, s: &str) -> Result<Self> {
        let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(s)?;
        if bytes.len() != SIGNATURE_LEN + RAW_DEVICE_ID_LEN {
            bail!("invalid ID size");
        }

        let (sig, raw) = bytes.split_at(SIGNATURE_LEN);
        let sig = Signature::from_slice(sig).context("error parsing signature")?;
        signing_key
            .0
            .verifying_key()
            .verify(raw, &sig)
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
    fn from_bytes(bytes: &[u8]) -> Result<Self> {
        // from_slice also accepts keys a few bytes shorter and pads them with zeros, but
        // to_base64 always writes KEY_LEN bytes, so a shorter key is a mistake.
        if bytes.len() != KEY_LEN {
            bail!("invalid key size {}, expected {}", bytes.len(), KEY_LEN);
        }
        let key = Key::from_slice(bytes).context("error parsing key")?;
        Ok(SigningKey(key))
    }

    pub fn generate() -> Self {
        SigningKey(Key::random(&mut rand::thread_rng()))
    }

    pub fn to_base64(&self) -> String {
        base64::engine::general_purpose::STANDARD.encode(self.0.to_bytes())
    }
}

impl FromStr for SigningKey {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self> {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(s)
            .context("error decoding base64")?;
        Self::from_bytes(&bytes)
    }
}

#[cfg(test)]
mod test {
    use base64::Engine as _;

    use super::{DeviceID, SigningKey};

    #[test]
    fn test_device_id() {
        let signing_key = SigningKey::generate();
        let device_id_str = DeviceID::new(&signing_key).to_string();
        DeviceID::from_string(&signing_key, &device_id_str).unwrap();

        let other_signing_key = SigningKey::generate();
        assert!(DeviceID::from_string(&other_signing_key, &device_id_str).is_err());
    }

    #[test]
    fn test_signing_key() {
        let signing_key = SigningKey::generate();
        let device_id_str = DeviceID::new(&signing_key).to_string();

        let parsed_signing_key: SigningKey = signing_key.to_base64().parse().unwrap();
        DeviceID::from_string(&parsed_signing_key, &device_id_str).unwrap();
    }

    #[test]
    fn test_invalid_signing_key() {
        let parse = |s: &str| s.parse::<SigningKey>();
        let encode = |bytes: &[u8]| base64::engine::general_purpose::STANDARD.encode(bytes);

        assert!(parse("").is_err());
        assert!(parse("not base64!").is_err());
        assert!(parse(&encode(&[1; 31])).is_err());
        assert!(parse(&encode(&[1; 33])).is_err());
        // zero is not a valid P-256 scalar
        assert!(parse(&encode(&[0; 32])).is_err());
        assert!(parse(&encode(&[1; 32])).is_ok());
    }
}
