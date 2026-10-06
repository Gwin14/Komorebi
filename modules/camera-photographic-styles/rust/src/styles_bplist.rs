//! Minimal binary plist writer for the style-metadata payload (R3c).
//!
//! Supports exactly the object kinds the style metadata needs:
//! bool / int (u64) / real (f64) / data / ASCII string / dict.

#[derive(Clone)]
enum Obj {
    Bool(bool),
    Int(u64),
    Real(f64),
    Data(Vec<u8>),
    Str(String),
    Dict(Vec<(usize, usize)>), // (key ref, value ref)
}

pub struct BplistWriter {
    objects: Vec<Obj>,
}

/// Validate the binary plist shape used by Apple Styles and locate its
/// `styleData` payload. The metadata contains several dictionaries and one
/// large Data object; requiring exactly 51,840 bytes catches truncated or
/// incorrectly grafted Styles outputs without depending on Apple's private
/// frameworks.
pub fn contains_data_object(payload: &[u8], expected_len: usize) -> bool {
    if payload.len() < 40 || &payload[..8] != b"bplist00" {
        return false;
    }
    let trailer = payload.len() - 32;
    let offset_size = payload[trailer + 6] as usize;
    let object_ref_size = payload[trailer + 7] as usize;
    let object_count = read_u64_be(&payload[trailer + 8..trailer + 16]);
    let offset_table = read_u64_be(&payload[trailer + 24..trailer + 32]) as usize;
    if offset_size == 0
        || offset_size > 8
        || object_ref_size == 0
        || object_ref_size > 8
        || object_count == 0
        || object_count > usize::MAX as u64
        || offset_table >= trailer
    {
        return false;
    }
    let object_count = object_count as usize;
    let table_len = match object_count.checked_mul(offset_size) {
        Some(v) => v,
        None => return false,
    };
    if offset_table.checked_add(table_len).unwrap_or(usize::MAX) > trailer {
        return false;
    }

    for index in 0..object_count {
        let at = offset_table + index * offset_size;
        let object_offset = read_sized_be(&payload[at..at + offset_size]);
        if object_offset >= offset_table || object_offset >= trailer {
            continue;
        }
        let marker = payload[object_offset];
        if marker >> 4 != 0x4 {
            continue;
        }
        let (length, header_len) = match plist_length(payload, object_offset) {
            Some(v) => v,
            None => continue,
        };
        if length == expected_len
            && object_offset
                .checked_add(header_len)
                .and_then(|start| start.checked_add(length))
                .map(|end| end <= offset_table)
                .unwrap_or(false)
        {
            return true;
        }
    }
    false
}

fn read_sized_be(bytes: &[u8]) -> usize {
    bytes.iter().fold(0usize, |value, byte| {
        value.saturating_mul(256).saturating_add(*byte as usize)
    })
}

fn read_u64_be(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0u64, |value, byte| {
        value.saturating_mul(256).saturating_add(*byte as u64)
    })
}

fn plist_length(payload: &[u8], object_offset: usize) -> Option<(usize, usize)> {
    let marker = payload[object_offset];
    let inline = (marker & 0x0f) as usize;
    if inline < 15 {
        return Some((inline, 1));
    }
    let int_marker = *payload.get(object_offset + 1)?;
    if int_marker >> 4 != 0x1 {
        return None;
    }
    let byte_count = 1usize.checked_shl((int_marker & 0x0f) as u32)?;
    let start = object_offset.checked_add(2)?;
    let end = start.checked_add(byte_count)?;
    if end > payload.len() {
        return None;
    }
    Some((read_sized_be(&payload[start..end]), 2 + byte_count))
}

impl BplistWriter {
    pub fn new() -> Self {
        Self {
            objects: Vec::new(),
        }
    }
    pub fn add_bool(&mut self, v: bool) -> usize {
        self.objects.push(Obj::Bool(v));
        self.objects.len() - 1
    }
    pub fn add_int(&mut self, v: u64) -> usize {
        self.objects.push(Obj::Int(v));
        self.objects.len() - 1
    }
    pub fn add_real(&mut self, v: f64) -> usize {
        self.objects.push(Obj::Real(v));
        self.objects.len() - 1
    }
    pub fn add_data(&mut self, v: &[u8]) -> usize {
        self.objects.push(Obj::Data(v.to_vec()));
        self.objects.len() - 1
    }
    pub fn add_str(&mut self, v: &str) -> usize {
        self.objects.push(Obj::Str(v.to_string()));
        self.objects.len() - 1
    }
    pub fn add_dict(&mut self, entries: &[(usize, usize)]) -> usize {
        self.objects.push(Obj::Dict(entries.to_vec()));
        self.objects.len() - 1
    }

    pub fn finish(&self, top: usize) -> Vec<u8> {
        // Object references must be addressable: 1 byte covers 255 objects,
        // but the stats-override path can exceed that, so widen dynamically.
        let object_ref_size = if self.objects.len() <= 0xff { 1 } else { 2 };
        let mut out = b"bplist00".to_vec();
        let mut offsets: Vec<u64> = Vec::with_capacity(self.objects.len());
        for obj in &self.objects {
            offsets.push(out.len() as u64);
            write_obj(&mut out, obj, object_ref_size);
        }
        let offset_table_offset = out.len() as u64;
        let max_offset = offset_table_offset + 8; // safe upper bound
        let offset_int_size = if max_offset <= 0xff {
            1u8
        } else if max_offset <= 0xffff {
            2
        } else {
            4
        };
        for off in &offsets {
            match offset_int_size {
                1 => out.push(*off as u8),
                2 => out.extend_from_slice(&(*off as u16).to_be_bytes()),
                _ => out.extend_from_slice(&(*off as u32).to_be_bytes()),
            }
        }
        // Trailer: 6 pad + offsetIntSize + objectRefSize + numObjects +
        // topObject + offsetTableOffset.
        out.extend_from_slice(&[0; 6]);
        out.push(offset_int_size);
        out.push(object_ref_size);
        out.extend_from_slice(&(self.objects.len() as u64).to_be_bytes());
        out.extend_from_slice(&(top as u64).to_be_bytes());
        out.extend_from_slice(&offset_table_offset.to_be_bytes());
        out
    }
}

fn write_len_prefixed(out: &mut Vec<u8>, marker_base: u8, len: usize) {
    if len < 15 {
        out.push(marker_base | len as u8);
    } else {
        out.push(marker_base | 0x0f);
        // length as an int object (inline, not registered)
        if len <= 0xff {
            out.push(0x10);
            out.push(len as u8);
        } else if len <= 0xffff {
            out.push(0x11);
            out.extend_from_slice(&(len as u16).to_be_bytes());
        } else {
            out.push(0x12);
            out.extend_from_slice(&(len as u32).to_be_bytes());
        }
    }
}

fn write_obj(out: &mut Vec<u8>, obj: &Obj, ref_size: u8) {
    match obj {
        Obj::Bool(false) => out.push(0x08),
        Obj::Bool(true) => out.push(0x09),
        Obj::Int(v) => {
            let bytes = if *v <= 0xff {
                1
            } else if *v <= 0xffff {
                2
            } else if *v <= 0xffff_ffff {
                4
            } else {
                8
            };
            let marker = 0x10
                | match bytes {
                    1 => 0,
                    2 => 1,
                    4 => 2,
                    _ => 3,
                };
            out.push(marker);
            out.extend_from_slice(&v.to_be_bytes()[8 - bytes..]);
        }
        Obj::Real(v) => {
            out.push(0x23);
            out.extend_from_slice(&v.to_be_bytes());
        }
        Obj::Data(v) => {
            write_len_prefixed(out, 0x40, v.len());
            out.extend_from_slice(v);
        }
        Obj::Str(s) => {
            debug_assert!(s.is_ascii());
            write_len_prefixed(out, 0x50, s.len());
            out.extend_from_slice(s.as_bytes());
        }
        Obj::Dict(entries) => {
            write_len_prefixed(out, 0xd0, entries.len());
            for (k, _) in entries {
                push_ref(out, *k, ref_size);
            }
            for (_, v) in entries {
                push_ref(out, *v, ref_size);
            }
        }
    }
}

fn push_ref(out: &mut Vec<u8>, index: usize, ref_size: u8) {
    match ref_size {
        1 => out.push(index as u8),
        _ => out.extend_from_slice(&(index as u16).to_be_bytes()),
    }
}

/// Upgrade only the Styles schema selector and its new boolean flag. All
/// image-dependent objects retain their original bytes and references.
pub fn promote_texture_schema(payload: &[u8]) -> Result<Vec<u8>, String> {
    let (mut offsets, ref_size, top, table) = object_table(payload)?;
    let root = offsets[top];
    if payload[root] >> 4 != 0xd {
        return Err("Styles root is not a dictionary".into());
    }
    let (count, header) = plist_length(payload, root).ok_or("invalid Styles dictionary")?;
    if count > offsets.len() {
        return Err("Styles dictionary too large".into());
    }
    let refs = payload
        .get(root + header..root + header + count * 2 * ref_size)
        .ok_or("invalid Styles references")?;
    let mut keys: Vec<usize> = refs[..count * ref_size]
        .chunks_exact(ref_size)
        .map(read_sized_be)
        .collect();
    let mut values: Vec<usize> = refs[count * ref_size..]
        .chunks_exact(ref_size)
        .map(read_sized_be)
        .collect();
    let key_index = |key: u8| {
        keys.iter().position(|id| {
            offsets
                .get(*id)
                .and_then(|p| payload.get(*p..*p + 2))
                .map(|b| b == [0x51, key])
                .unwrap_or(false)
        })
    };
    let version = key_index(b'0').ok_or("Styles version selector missing")?;
    let l = key_index(b'l');
    let mut output = payload[..table].to_vec();
    let version_id = offsets.len();
    offsets.push(output.len());
    output.extend_from_slice(&[0x10, 16]);
    values[version] = version_id;
    let false_id = offsets.len();
    offsets.push(output.len());
    output.push(0x08);
    if let Some(index) = l {
        values[index] = false_id;
    } else {
        let key_id = offsets.len();
        offsets.push(output.len());
        output.extend_from_slice(&[0x51, b'l']);
        keys.push(key_id);
        values.push(false_id);
    }
    if ref_size < 8 && offsets.len() as u64 >= (1u64 << (ref_size * 8)) {
        return Err("Styles object references overflow".into());
    }
    offsets[top] = output.len();
    if keys.len() < 15 {
        output.push(0xd0 | keys.len() as u8);
    } else {
        output.extend_from_slice(&[0xdf, 0x12]);
        output.extend_from_slice(&(keys.len() as u32).to_be_bytes());
    }
    for id in keys.iter().chain(&values) {
        output.extend_from_slice(&(*id as u64).to_be_bytes()[8 - ref_size..]);
    }
    let new_table = output.len();
    for offset in &offsets {
        output.extend_from_slice(&(*offset as u64).to_be_bytes());
    }
    output.extend_from_slice(&[0, 0, 0, 0, 0, 0, 8, ref_size as u8]);
    output.extend_from_slice(&(offsets.len() as u64).to_be_bytes());
    output.extend_from_slice(&(top as u64).to_be_bytes());
    output.extend_from_slice(&(new_table as u64).to_be_bytes());
    Ok(output)
}

fn object_table(payload: &[u8]) -> Result<(Vec<usize>, usize, usize, usize), String> {
    if payload.len() < 40 || !payload.starts_with(b"bplist00") {
        return Err("invalid Styles plist".into());
    }
    let trailer = &payload[payload.len() - 32..];
    let os = trailer[6] as usize;
    let rs = trailer[7] as usize;
    let count = read_sized_be(&trailer[8..16]);
    let top = read_sized_be(&trailer[16..24]);
    let table = read_sized_be(&trailer[24..32]);
    if os == 0 || os > 8 || rs == 0 || rs > 8 || top >= count {
        return Err("invalid Styles object table".into());
    }
    let size = count.checked_mul(os).ok_or("Styles table overflow")?;
    let bytes = payload
        .get(table..table.checked_add(size).ok_or("Styles table overflow")?)
        .ok_or("Styles table truncated")?;
    let offsets: Vec<_> = bytes.chunks_exact(os).map(read_sized_be).collect();
    if offsets.iter().any(|p| *p < 8 || *p >= table) {
        return Err("Styles object outside table".into());
    }
    Ok((offsets, rs, top, table))
}

pub fn has_texture_schema(payload: &[u8]) -> bool {
    let Ok((offsets, rs, top, _)) = object_table(payload) else {
        return false;
    };
    let root = offsets[top];
    if payload[root] >> 4 != 0xd {
        return false;
    }
    let Some((count, header)) = plist_length(payload, root) else {
        return false;
    };
    if count > offsets.len() {
        return false;
    }
    let Some(refs) = payload.get(root + header..root + header + count * rs * 2) else {
        return false;
    };
    let value = |key: u8| -> Option<usize> {
        for i in 0..count {
            let k = read_sized_be(&refs[i * rs..(i + 1) * rs]);
            if payload.get(*offsets.get(k)?..offsets[k] + 2)? == [0x51, key] {
                let v = read_sized_be(&refs[(count + i) * rs..(count + i + 1) * rs]);
                return offsets.get(v).copied();
            }
        }
        None
    };
    let Some(v) = value(b'0') else {
        return false;
    };
    let marker = payload[v];
    if marker >> 4 != 1 {
        return false;
    }
    let Some(length) = 1usize.checked_shl((marker & 15) as u32) else {
        return false;
    };
    payload.get(v + 1..v + 1 + length).map(read_sized_be) == Some(16)
        && value(b'l').map(|p| payload[p]) == Some(0x08)
}

#[cfg(test)]
mod texture_schema_tests {
    use super::*;
    #[test]
    fn texture_schema_upgrade_preserves_all_original_objects() {
        let original = crate::styles_native::build_style_metadata();
        let (_, _, _, old_table) = object_table(&original).unwrap();
        assert!(!has_texture_schema(&original));
        let upgraded = promote_texture_schema(&original).unwrap();
        assert_eq!(&upgraded[..old_table], &original[..old_table]);
        assert!(has_texture_schema(&upgraded));
        assert!(contains_data_object(&upgraded, 51_840));
        assert!(has_texture_schema(
            &promote_texture_schema(&upgraded).unwrap()
        ));
    }
    #[test]
    fn texture_schema_rejects_incomplete_plists() {
        for data in [&b"bplist00"[..], &b""[..], &b"not a plist"[..]] {
            assert!(!has_texture_schema(data));
            assert!(promote_texture_schema(data).is_err());
        }
    }
}
