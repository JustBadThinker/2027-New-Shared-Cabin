# Security Specification for Wired Boat Images

## 1. Data Invariants
- Custom image mappings can only be requested and shown for users who are authenticated.
- The `wiredBoatImages` collection holds mappings from a sanitized boat name (as a unique key) to a list of direct images.
- An record contains 4 keys: `boatName`, `urls`, `updatedBy`, and `updatedAt`. No shadow fields or extra properties are allowed.
- The `boatName` matches the name of the boat in the system.
- The `urls` list contains manually-wired direct image links, limited to at most 50 URLs to prevent Denial of Wallet attack.
- The `updatedBy` field must match the creator's actual `request.auth.uid`.
- Cumulative updates are validated to prevent skipping schema types.

## 2. Dynamic Tests and Payloads
We define standard test schemas to ensure:
- Only verified, authenticated users can write mappings.
- Invalid keys, oversized payloads, non-string boatName, and mismatched `updatedBy` identifiers are flatly rejected.
