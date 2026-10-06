//! Update the primary HDR XMP without letting ImageIO rewrite the Styles graph.
use crate::{isobmff, isobmff_write, styles_attach};

fn item_id(meta: &isobmff::ParsedMeta) -> Result<u32, String> {
    meta.items
        .iter()
        .find(|item| {
            item.itype.starts_with("mime")
                && item
                    .raw_infe
                    .windows(b"hdrgm-xmp\0".len())
                    .any(|w| w == b"hdrgm-xmp\0")
                && item
                    .raw_infe
                    .windows(b"application/rdf+xml\0".len())
                    .any(|w| w == b"application/rdf+xml\0")
        })
        .map(|item| item.item_id)
        .ok_or_else(|| "primary HDR XMP item not found".into())
}

pub fn read(data: &[u8]) -> Result<Vec<u8>, String> {
    let meta = isobmff::parse_source_meta(data)?;
    styles_attach::item_payload_bytes(data, &meta, item_id(&meta)?)
        .ok_or_else(|| "primary HDR XMP payload is invalid".into())
}

pub fn replace(data: &[u8], xmp: &[u8]) -> Result<Vec<u8>, String> {
    let meta = isobmff::parse_source_meta(data)?;
    let mut output = data.to_vec();
    let id = item_id(&meta)?;
    let location = meta.iloc_entries.iter().find(|e| e.item_id == id)
        .ok_or("HDR XMP location not found")?;
    if location.construction_method == 1 {
        output = replace_idat_payload(data, &meta, id, xmp)?;
    } else {
        isobmff_write::replace_item_payload(&mut output, id, None, xmp)?;
    }
    if read(&output)? != xmp
        || !crate::verify_iso_gain_map(&output)
        || !crate::verify_photographic_styles(&output)
    {
        return Err("catalog XMP update did not preserve Photographic Styles and HDR".into());
    }
    Ok(output)
}

// The Styles writer stores HDR XMP in idat. Keep it there; moving it to
// another data box changes the writer's proven layout even if iloc is valid.
fn replace_idat_payload(data: &[u8], parsed: &isobmff::ParsedMeta, id: u32, xmp: &[u8]) -> Result<Vec<u8>, String> {
    let top = isobmff::parse_boxes(data, 0, data.len());
    let meta = top.iter().find(|b| b.btype == *b"meta").ok_or("missing meta")?;
    let children = isobmff::parse_boxes(data, meta.data_start + 4, meta.data_end);
    let idat = children.iter().find(|b| b.btype == *b"idat").ok_or("missing idat")?;
    let location = parsed.iloc_entries.iter().find(|e| e.item_id == id).ok_or("missing XMP location")?;
    if location.extents.len() != 1 || location.data_reference_index != 0 {
        return Err("unsupported HDR XMP extents".into());
    }
    let (offset, length) = location.extents[0];
    let end = offset.checked_add(length).ok_or("XMP extent overflow")?;
    let old = &data[idat.data_start..idat.data_end];
    let before = old.get(..offset as usize).ok_or("invalid XMP start")?;
    let after = old.get(end as usize..).ok_or("invalid XMP end")?;
    let mut payload = before.to_vec();
    payload.extend_from_slice(xmp);
    payload.extend_from_slice(after);
    let new_idat = isobmff::make_box(b"idat", &payload);
    let payload_delta = xmp.len() as i64 - length as i64;
    let mut locations = parsed.iloc_entries.clone();
    for entry in &mut locations {
        if entry.item_id == id {
            entry.extents = vec![(offset, xmp.len() as u64)];
        } else if entry.construction_method == 1 {
            for (start, size) in &mut entry.extents {
                if *start >= end {
                    *start = start.checked_add_signed(payload_delta).ok_or("idat offset overflow")?;
                } else if start.checked_add(*size).ok_or("extent overflow")? > offset {
                    return Err("overlapping HDR XMP extent".into());
                }
            }
        }
    }
    let assemble = |locations: &[isobmff::IlocEntry]| {
        let mut body = data[meta.data_start..meta.data_start + 4].to_vec();
        for child in &children {
            match &child.btype {
                b"idat" => body.extend_from_slice(&new_idat),
                b"iloc" => body.extend_from_slice(&isobmff::make_iloc_box(locations)),
                _ => body.extend_from_slice(&data[child.box_start..child.data_end]),
            }
        }
        isobmff::make_box(b"meta", &body)
    };
    let provisional = assemble(&locations);
    let meta_delta = provisional.len() as i64 - meta.size as i64;
    for entry in &mut locations {
        if entry.construction_method == 0 {
            for (start, size) in &mut entry.extents {
                if *start >= meta.data_end as u64 {
                    *start = start.checked_add_signed(meta_delta).ok_or("file offset overflow")?;
                } else if start.checked_add(*size).ok_or("extent overflow")? > meta.box_start as u64 {
                    return Err("file extent overlaps meta".into());
                }
            }
        }
    }
    let new_meta = assemble(&locations);
    if new_meta.len() != provisional.len() { return Err("unstable meta length".into()); }
    let mut output = data[..meta.box_start].to_vec();
    output.extend_from_slice(&new_meta);
    output.extend_from_slice(&data[meta.data_end..]);
    Ok(output)
}
