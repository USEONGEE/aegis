// Fixture: empty catch violations (for no-empty-catch check)

// VIOLATION: completely empty catch
try { JSON.parse('') } catch {}

// VIOLATION: comment-only catch
try { JSON.parse('') } catch {
  // ignore
}

// NON-VIOLATION: has statement
try { JSON.parse('') } catch (err) { console.log(err) }

// NON-VIOLATION: has return statement (ES2019 optional catch binding)
try { JSON.parse('') } catch { return null }

// NON-VIOLATION: has throw statement
try { JSON.parse('') } catch (err) { throw err }
